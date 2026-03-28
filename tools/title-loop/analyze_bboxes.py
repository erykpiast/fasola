#!/usr/bin/env python3
"""
Analyze bounding box data from recognize_bboxes.py to evaluate
geometric title extraction heuristics.

Reads:  tools/title-loop/bboxes/_all.json
        tools/title-loop/input/*.real.txt (ground truth)

Output: tools/title-loop/bboxes/_analysis_report.json
        stdout summary
"""

import json
import re
import statistics
import unicodedata
from pathlib import Path

BBOXES_DIR = Path(__file__).parent / "bboxes"
INPUT_DIR = Path(__file__).parent / "input"
ALL_JSON = BBOXES_DIR / "_all.json"


# ── Matching logic (from eval_model.py) ──────────────────────────────────────


def normalize(s):
    return re.sub(r"\s+", " ", s.strip()).upper()


def strip_diacritics(s):
    s = s.replace("ł", "l").replace("Ł", "L")
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


def ocr_normalize(s):
    return s.replace("0", "O").replace("1", "I").replace("5", "S")


def norm_for_match(s):
    return ocr_normalize(strip_diacritics(normalize(s).replace("-", " ").replace("_", " ")))


def titles_match(extracted, expected):
    if not extracted:
        return False
    extracted_norm = norm_for_match(extracted)
    expected_parts = [norm_for_match(p) for p in expected.split("+")]
    return all(part in extracted_norm for part in expected_parts)


_LANG_RE = re.compile(r"\.(pl|en)\.real\.txt$")


def extract_expected_title(filename):
    name = Path(filename).name
    return re.sub(r"\.(pl|en)\.real\.txt$", "", name)


# ── Ground truth matching ────────────────────────────────────────────────────


def load_ground_truth():
    """Load .real.txt files and return list of {expected_title, text_words}."""
    entries = []
    for f in sorted(INPUT_DIR.glob("*.real.txt")):
        m = _LANG_RE.search(f.name)
        if not m:
            continue
        title = extract_expected_title(f.name)
        text = f.read_text(encoding="utf-8", errors="replace")
        words = set(normalize(text).split())
        entries.append({"file": f.name, "expected_title": title, "words": words, "lang": m.group(1)})
    return entries


def match_images_to_ground_truth(all_bboxes, ground_truth):
    """Match each image's OCR text to the best ground truth file by word overlap."""
    matches = []
    used_gt = set()

    for img_entry in all_bboxes:
        img_text = " ".join(obs["text"] for obs in img_entry["observations"])
        img_words = set(normalize(img_text).split())

        best_score = 0.0
        best_gt = None

        for gt in ground_truth:
            if gt["file"] in used_gt:
                continue
            intersection = len(img_words & gt["words"])
            union = len(img_words | gt["words"])
            if union == 0:
                continue
            jaccard = intersection / union
            if jaccard > best_score:
                best_score = jaccard
                best_gt = gt

        if best_gt and best_score >= 0.3:
            matches.append({
                "image": img_entry["image"],
                "expected_title": best_gt["expected_title"],
                "lang": best_gt["lang"],
                "match_confidence": round(best_score, 3),
                "observations": img_entry["observations"],
            })
            used_gt.add(best_gt["file"])

    return matches


# ── Geometric heuristics ─────────────────────────────────────────────────────


def find_same_y_groups(observations, y_tolerance=0.03, height_ratio=0.5):
    """Group observations that sit on the same horizontal band."""
    if not observations:
        return []

    sorted_obs = sorted(observations, key=lambda o: o["bbox"]["y"])
    groups = []
    current_group = [sorted_obs[0]]

    for obs in sorted_obs[1:]:
        prev = current_group[-1]
        y_diff = abs(obs["bbox"]["y"] - prev["bbox"]["y"])
        h_prev = prev["bbox"]["height"]
        h_curr = obs["bbox"]["height"]
        # Same band: close Y position AND similar height
        if h_prev > 0 and h_curr > 0:
            ratio = min(h_prev, h_curr) / max(h_prev, h_curr)
        else:
            ratio = 0
        if y_diff < y_tolerance and ratio > height_ratio:
            current_group.append(obs)
        else:
            groups.append(current_group)
            current_group = [obs]

    groups.append(current_group)
    return groups


def heuristic_largest_single(observations):
    """Pick the observation with the tallest bounding box height."""
    if not observations:
        return None
    best = max(observations, key=lambda o: o["bbox"]["height"])
    return best["text"]


def heuristic_merge_same_y(observations):
    """Merge same-Y-band observations, then pick the tallest merged group."""
    groups = find_same_y_groups(observations)
    if not groups:
        return None

    # For each group, compute average height and merged text
    scored = []
    for group in groups:
        avg_height = statistics.mean(o["bbox"]["height"] for o in group)
        # Sort by X within group to get left-to-right reading order
        sorted_group = sorted(group, key=lambda o: o["bbox"]["x"])
        merged_text = " ".join(o["text"] for o in sorted_group)
        scored.append((avg_height, merged_text))

    best = max(scored, key=lambda s: s[0])
    return best[1]


def heuristic_top_page_largest(observations):
    """Filter to top 60% of page, then pick tallest."""
    top_obs = [o for o in observations if o["bbox"]["y"] < 0.6]
    if not top_obs:
        # Fall back to all observations
        top_obs = observations
    if not top_obs:
        return None
    best = max(top_obs, key=lambda o: o["bbox"]["height"])
    return best["text"]


def heuristic_weighted_score(observations):
    """Full geometric scoring with weighted features (from spec 021)."""
    if not observations:
        return None

    max_height = max(o["bbox"]["height"] for o in observations)
    if max_height == 0:
        return None

    # Compute isolation (min gap to nearest neighbor)
    y_centers = [o["bbox"]["y"] + o["bbox"]["height"] / 2 for o in observations]
    gaps = []
    for i, obs in enumerate(observations):
        min_gap = float("inf")
        for j, other in enumerate(observations):
            if i == j:
                continue
            gap = abs(y_centers[i] - y_centers[j])
            if gap < min_gap:
                min_gap = gap
        gaps.append(min_gap if min_gap != float("inf") else 0)
    median_gap = statistics.median(gaps) if gaps else 1.0

    scores = []
    for i, obs in enumerate(observations):
        h = obs["bbox"]["height"]
        relative_height = h / max_height
        vertical_position = 1.0 - obs["bbox"]["y"]
        width_ratio = obs["bbox"]["width"]
        isolation = (gaps[i] / median_gap) if median_gap > 0 else 0
        line_count = obs["text"].count("\n") + 1
        brevity = 1.0 - min(line_count / 5.0, 1.0)

        score = (
            0.35 * relative_height
            + 0.20 * vertical_position
            + 0.10 * width_ratio
            + 0.20 * min(isolation, 2.0) / 2.0  # cap isolation contribution
            + 0.15 * brevity
        )
        scores.append((score, obs["text"]))

    best = max(scores, key=lambda s: s[0])
    return best[1]


# ── Fragmentation analysis ───────────────────────────────────────────────────


def analyze_fragmentation(observations):
    """Detect same-Y-band observations that may be fragments of one line."""
    groups = find_same_y_groups(observations)
    fragmented_groups = [g for g in groups if len(g) > 1]
    return fragmented_groups


# ── Main ─────────────────────────────────────────────────────────────────────


def main():
    if not ALL_JSON.exists():
        print(f"Error: {ALL_JSON} not found. Run recognize_bboxes.py first.")
        return

    print("Loading bounding box data...")
    all_bboxes = json.loads(ALL_JSON.read_text(encoding="utf-8"))
    print(f"  {len(all_bboxes)} images loaded")

    print("Loading ground truth from .real.txt files...")
    ground_truth = load_ground_truth()
    print(f"  {len(ground_truth)} ground truth files loaded")

    print("Matching images to ground truth...")
    matches = match_images_to_ground_truth(all_bboxes, ground_truth)
    print(f"  {len(matches)} images matched (threshold >= 0.3)")

    low_confidence = [m for m in matches if m["match_confidence"] < 0.5]
    if low_confidence:
        print(f"  ⚠ {len(low_confidence)} matches with low confidence (0.3-0.5)")

    # ── Per-image stats ──────────────────────────────────────────────────

    obs_counts = [len(m["observations"]) for m in matches]
    all_heights = [
        o["bbox"]["height"] for m in matches for o in m["observations"]
    ]

    # ── Fragmentation analysis ───────────────────────────────────────────

    fragmentation_count = 0
    fragmentation_examples = []
    for m in matches:
        frags = analyze_fragmentation(m["observations"])
        if frags:
            fragmentation_count += 1
            if len(fragmentation_examples) < 20:
                for group in frags:
                    fragmentation_examples.append({
                        "image": m["image"],
                        "fragments": [
                            {"text": o["text"], "bbox": o["bbox"]}
                            for o in sorted(group, key=lambda o: o["bbox"]["x"])
                        ],
                    })

    # ── Heuristic evaluation ─────────────────────────────────────────────

    heuristics = {
        "largest_single": heuristic_largest_single,
        "merge_same_y": heuristic_merge_same_y,
        "top_page_largest": heuristic_top_page_largest,
        "weighted_score": heuristic_weighted_score,
    }

    heuristic_results = {}
    heuristic_failures = {}

    for name, fn in heuristics.items():
        matched = 0
        total = len(matches)
        failures = []

        for m in matches:
            extracted = fn(m["observations"])
            expected = m["expected_title"]

            if titles_match(extracted, expected):
                matched += 1
            else:
                if len(failures) < 30:
                    failures.append({
                        "image": m["image"],
                        "expected": expected,
                        "extracted": extracted or "(none)",
                    })

        accuracy = matched / total if total > 0 else 0
        heuristic_results[name] = {
            "matched": matched,
            "total": total,
            "accuracy": round(accuracy, 4),
        }
        heuristic_failures[name] = failures

    # ── Build report ─────────────────────────────────────────────────────

    report = {
        "total_images_processed": len(all_bboxes),
        "images_matched_to_ground_truth": len(matches),
        "low_confidence_matches": len(low_confidence),
        "stats": {
            "observations_per_image": {
                "mean": round(statistics.mean(obs_counts), 1) if obs_counts else 0,
                "median": round(statistics.median(obs_counts), 1) if obs_counts else 0,
                "min": min(obs_counts) if obs_counts else 0,
                "max": max(obs_counts) if obs_counts else 0,
            },
            "bbox_height_percentiles": {
                "p10": round(sorted(all_heights)[len(all_heights) // 10], 6) if all_heights else 0,
                "p25": round(sorted(all_heights)[len(all_heights) // 4], 6) if all_heights else 0,
                "p50": round(statistics.median(all_heights), 6) if all_heights else 0,
                "p75": round(sorted(all_heights)[3 * len(all_heights) // 4], 6) if all_heights else 0,
                "p90": round(sorted(all_heights)[9 * len(all_heights) // 10], 6) if all_heights else 0,
            },
            "fragmentation_rate": round(fragmentation_count / len(matches), 4) if matches else 0,
            "fragmented_image_count": fragmentation_count,
        },
        "heuristic_accuracy": heuristic_results,
        "fragmentation_examples": fragmentation_examples[:20],
        "failures_per_heuristic": heuristic_failures,
    }

    # Write report
    report_path = BBOXES_DIR / "_analysis_report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    # ── Print summary ────────────────────────────────────────────────────

    print("\n" + "=" * 60)
    print("GEOMETRIC TITLE EXTRACTION — MERGING STRATEGY ANALYSIS")
    print("=" * 60)

    print(f"\nImages processed:            {report['total_images_processed']}")
    print(f"Matched to ground truth:     {report['images_matched_to_ground_truth']}")
    print(f"Low confidence matches:      {report['low_confidence_matches']}")

    s = report["stats"]
    print(f"\nObservations per image:      mean={s['observations_per_image']['mean']}, "
          f"median={s['observations_per_image']['median']}, "
          f"range=[{s['observations_per_image']['min']}-{s['observations_per_image']['max']}]")
    print(f"Bbox height (p50):           {s['bbox_height_percentiles']['p50']:.4f}")
    print(f"Fragmentation rate:          {s['fragmentation_rate']:.1%} "
          f"({s['fragmented_image_count']} images)")

    print(f"\nHeuristic accuracy:")
    for name, result in report["heuristic_accuracy"].items():
        print(f"  {name:25s}  {result['accuracy']:.1%}  ({result['matched']}/{result['total']})")

    print(f"\nReport written to: {report_path}")

    # Print a few fragmentation examples
    if fragmentation_examples:
        print(f"\nFragmentation examples (first 5):")
        for ex in fragmentation_examples[:5]:
            texts = [f["text"] for f in ex["fragments"]]
            print(f"  {ex['image']}: {texts}")

    # Print a few failures for each heuristic
    for name, failures in heuristic_failures.items():
        if failures:
            print(f"\nSample failures for '{name}' (first 5):")
            for f in failures[:5]:
                print(f"  {f['image']}: expected='{f['expected']}' got='{f['extracted']}'")


if __name__ == "__main__":
    main()

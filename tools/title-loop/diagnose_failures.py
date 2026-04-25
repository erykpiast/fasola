#!/usr/bin/env python3
"""
Diagnose whether title extraction failures come from clustering or scoring.

For each image that the region_clustering heuristic gets wrong, checks whether
ANY region contains the expected title text. If yes → scoring failure (right
region exists, wrong one picked). If no → clustering failure (title was split
or merged beyond recognition).
"""

import json
import sys
from pathlib import Path

# Reuse everything from analyze_bboxes
sys.path.insert(0, str(Path(__file__).parent))
from analyze_bboxes import (
    ALL_JSON,
    cluster_into_regions,
    load_ground_truth,
    match_images_to_ground_truth,
    titles_match,
    heuristic_region_clustering,
    _strip_trailing_ingredients,
    validate_title_text,
    _extract_leading_title,
    norm_for_match,
)


def region_text_variants(region):
    """All text forms we'd accept from a region as a title."""
    texts = []
    # Full region text
    texts.append(region["text"])
    texts.append(_strip_trailing_ingredients(region["text"]))
    # Leading observation(s)
    leading = _extract_leading_title(region)
    if leading:
        texts.append(leading)
    return [t for t in texts if t and validate_title_text(t)]


def main():
    all_bboxes = json.loads(ALL_JSON.read_text(encoding="utf-8"))
    ground_truth = load_ground_truth()
    matches = match_images_to_ground_truth(all_bboxes, ground_truth)

    clustering_failures = []
    scoring_failures = []
    successes = 0

    for m in matches:
        expected = m["expected_title"]
        extracted = heuristic_region_clustering(m["observations"])

        if titles_match(extracted, expected):
            successes += 1
            continue

        # It's a failure. Now: does any region contain the title?
        regions = cluster_into_regions(m["observations"])
        found_in_region = False
        matching_region_text = None

        for region in regions:
            for variant in region_text_variants(region):
                if titles_match(variant, expected):
                    found_in_region = True
                    matching_region_text = variant
                    break
            if found_in_region:
                break

        entry = {
            "image": m["image"],
            "lang": m["lang"],
            "expected": expected,
            "extracted": str(extracted) if extracted else "(none)",
            "num_regions": len(regions),
        }

        if found_in_region:
            entry["matching_region_text"] = matching_region_text
            scoring_failures.append(entry)
        else:
            # Show what regions exist for debugging
            entry["region_texts"] = [
                r["text"][:80] for r in sorted(regions, key=lambda r: -r["mean_line_height"])[:5]
            ]
            clustering_failures.append(entry)

    total = len(matches)
    print(f"Total images: {total}")
    print(f"Successes:    {successes} ({successes/total:.1%})")
    print(f"Failures:     {total - successes} ({(total-successes)/total:.1%})")
    print()
    print(f"  Scoring failures:    {len(scoring_failures):3d}  (right region exists, wrong one picked)")
    print(f"  Clustering failures: {len(clustering_failures):3d}  (no region matches the title)")
    print()

    if scoring_failures:
        print("─── SCORING FAILURES (region exists but not selected) ───")
        for f in scoring_failures:
            print(f"  [{f['lang']}] {f['image']}")
            print(f"       expected:  {f['expected']}")
            print(f"       extracted: {f['extracted'][:80]}")
            print(f"       correct region had: {f['matching_region_text'][:80]}")
            print()

    if clustering_failures:
        print("─── CLUSTERING FAILURES (no region matches title) ───")
        for f in clustering_failures:
            print(f"  [{f['lang']}] {f['image']}")
            print(f"       expected: {f['expected']}")
            print(f"       extracted: {f['extracted'][:80]}")
            print(f"       top regions:")
            for rt in f["region_texts"]:
                print(f"         - {rt}")
            print()


if __name__ == "__main__":
    main()

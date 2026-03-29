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
from collections import defaultdict
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
    s = normalize(s)
    # Strip quotes and apostrophes (OCR decorations / Polish „ quotes)
    s = re.sub(r"[\"\u0027\u2018\u2019\u201C\u201D\u201E\u201F`]", "", s)
    # OCR: pipe is often misread letter I
    s = s.replace("|", "I")
    # Ensure consistent tokenization around &
    s = s.replace("&", " & ")
    s = s.replace("-", " ").replace("_", " ")
    # Re-collapse whitespace after replacements (e.g. "SLOW- ROASTED" → "SLOW ROASTED")
    s = re.sub(r"\s+", " ", s).strip()
    return ocr_normalize(strip_diacritics(s))


def _levenshtein(a, b):
    """Compute Levenshtein edit distance between two strings."""
    if len(a) < len(b):
        return _levenshtein(b, a)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a):
        curr = [i + 1]
        for j, cb in enumerate(b):
            cost = 0 if ca == cb else 1
            curr.append(min(curr[j] + 1, prev[j + 1] + 1, prev[j] + cost))
        prev = curr
    return prev[-1]


def titles_match(extracted, expected):
    if not extracted:
        return False
    extracted_norm = norm_for_match(extracted)
    expected_parts = [norm_for_match(p) for p in expected.split("+")]
    # Primary: substring containment
    if all(part in extracted_norm for part in expected_parts):
        return True
    # Fallback: word-level matching — handles reordered text from multi-line
    # titles and extra whitespace from line-break hyphens (e.g. "SLOW- ROASTED")
    extracted_word_list = extracted_norm.split()
    extracted_words = set(extracted_word_list)
    if all(
        all(w in extracted_words for w in part.split())
        for part in expected_parts
    ):
        return True
    # Fallback: adjacent word-pair concatenation — handles line-break hyphen
    # splits where two extracted words form one expected word
    # (e.g. "SHORT BREAD" matches expected "SHORTBREAD")
    adjacent_pairs = {extracted_word_list[i] + extracted_word_list[i + 1]
                      for i in range(len(extracted_word_list) - 1)}
    all_forms = extracted_words | adjacent_pairs
    if all(
        all(w in all_forms for w in part.split())
        for part in expected_parts
    ):
        return True
    # Fallback: fuzzy word matching — tolerates OCR errors per word.
    # Longer words (≥5 chars) allow distance 2 for multi-char OCR corruption
    # at word boundaries (e.g. "PIERNICZKI"→"FERNICZKI", "LEMON"→"MON").
    # Short words keep distance 1 to avoid false positives.
    return all(
        all(
            any(_levenshtein(w, ew) <= (2 if len(w) >= 5 else 1) for ew in extracted_word_list)
            for w in part.split()
        )
        for part in expected_parts
    )


_LANG_RE = re.compile(r"\.(pl|en)\.real\.txt$")

_PATTERN_SUFFIX_RE = re.compile(
    r"\.(simple|spillover|split_title|metadata|corruption|narrative|compound|"
    r"multi_language|category_season|servings_before|timing_before|corrupted|"
    r"catastrophic|website|multilang|pipe|aug\d+)$"
)


def extract_expected_title(filename):
    name = Path(filename).name
    cleaned = re.sub(r"\.(pl|en)\.real\.txt$", "", name)
    cleaned = _PATTERN_SUFFIX_RE.sub("", cleaned)
    return cleaned


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


# ── Region clustering (spec 022) ─────────────────────────────────────────────

# Ingredient/section patterns for text validation
_MEASUREMENT_RE = re.compile(
    r"\b\d+\s*(g|ml|kg|cup|cups|tbsp|tsp|tablespoon|teaspoon|oz|"
    r"łyżka|łyżki|łyżek|łyżeczka|szklanka|szklanki|szczypta|garść)\b",
    re.IGNORECASE,
)

_SECTION_LABELS = {
    # English
    "ingredients", "directions", "instructions", "method", "preparation",
    "steps", "notes", "tip", "tips", "variations", "garnish", "topping",
    "serving", "glaze", "filling", "frosting",
    # Polish (no diacritics)
    "skladniki", "przygotowanie", "sposob przygotowania", "sposob wykonania",
    "wykonanie", "wskazowki", "sos", "nadzienie", "polewa", "ciasto",
    "instrukcje", "uwagi", "notatki", "podawanie",
}

# Polish recipe timing/servings metadata block (not a title).
# Applied to diacritic-stripped text for OCR robustness.
_RECIPE_METADATA_RE = re.compile(
    r"\b(DLA\s+\d+\s+OSOB|GOTOWANIE\s+\d|PRZYGOTOWANIE\s+\d|MROZENIE\s+\d|OCZEKIWANIE\s+\d"
    r"|PORCJ[EI]\b|\d+\s*PORCJ[EI]\b"
    r"|\bSERVES\s+\d|\bMAKES\s*:?\s*\d|\bYIELD\b)",
    re.IGNORECASE,
)


def detect_columns(observations, min_gap=0.03):
    """Detect text columns by finding the X position where most observations have a gap.

    Wide-spanning elements (titles, headers) can bridge column gaps, so we can't just
    merge X intervals. Instead, we test candidate split positions and count how many
    observations fall cleanly into left vs right, penalizing observations that straddle
    the split.

    Returns a list of observation lists, one per column (left to right).
    If no significant column split is found, returns [observations].
    """
    if len(observations) < 6:
        return [observations]

    # Collect all right-edges and left-edges as candidate split points
    edges = set()
    for o in observations:
        edges.add(round(o["bbox"]["x"] + o["bbox"]["width"], 3))
        edges.add(round(o["bbox"]["x"], 3))

    best_split = None
    best_score = -1

    for split_x in sorted(edges):
        if split_x < 0.15 or split_x > 0.85:
            continue  # skip extreme edges

        left = []
        right = []
        straddling = 0

        for o in observations:
            ox = o["bbox"]["x"]
            or_ = ox + o["bbox"]["width"]

            if or_ <= split_x + 0.01:
                left.append(o)
            elif ox >= split_x - 0.01:
                right.append(o)
            else:
                straddling += 1

        # Good split: many observations on each side, few straddling
        if len(left) < 3 or len(right) < 3:
            continue

        # Check that there's actually a gap at this position
        # (left side right-edges should end before split, right side left-edges should start after)
        if left and right:
            left_max_right = max(o["bbox"]["x"] + o["bbox"]["width"] for o in left)
            right_min_left = min(o["bbox"]["x"] for o in right)
            gap = right_min_left - left_max_right
            if gap < min_gap:
                continue

        # Reject splits where too many observations straddle the boundary
        total = len(left) + len(right) + straddling
        if straddling / total > 0.2:
            continue

        # Score: maximize clean splits, penalize straddling
        score = (len(left) + len(right)) - straddling * 3

        if score > best_score:
            best_score = score
            best_split = split_x

    if best_split is None:
        return [observations]

    # Split observations at best_split; straddling ones go to whichever side their center falls
    left_col = []
    right_col = []
    for o in observations:
        center_x = o["bbox"]["x"] + o["bbox"]["width"] / 2
        if center_x < best_split:
            left_col.append(o)
        else:
            right_col.append(o)

    if len(left_col) < 3 or len(right_col) < 3:
        return [observations]

    return [left_col, right_col]


def cluster_into_regions(observations, y_tolerance=0.05, region_gap=0.04):
    """Cluster observations into spatial regions.

    Step 0: Detect columns (significant horizontal gaps).
    Step 1: Within each column, sort by Y.
    Step 2: Group into horizontal bands (close Y + similar height).
    Step 3: Merge adjacent bands into regions (small vertical gap + overlapping X).
    Step 4: Compute region properties.
    """
    if not observations:
        return []

    # Step 0: Detect columns
    columns = detect_columns(observations)

    all_regions = []
    for col_obs in columns:
        col_regions = _cluster_column(col_obs, y_tolerance, region_gap)
        all_regions.extend(col_regions)

    # Step 5: Post-merge stacked title lines.
    # Adjacent small regions (1-2 lines, short text) with similar left alignment
    # and similar line height are likely parts of one multi-line title.
    all_regions = _merge_stacked_title_lines(all_regions)

    return all_regions


def _merge_stacked_title_lines(regions):
    """Merge small regions that look like stacked title lines.

    Groups regions by left-edge alignment (same X column), then within each
    group merges consecutive small regions with similar line height.
    This handles multi-line titles where each word/line is a separate region.
    """
    if len(regions) < 2:
        return regions

    # Group regions by left edge (quantize to 0.05)
    x_groups = defaultdict(list)
    for region in regions:
        x_bucket = round(region["bbox"]["x"] * 20) / 20  # quantize to 0.05
        x_groups[x_bucket].append(region)

    merged_all = []

    for x_bucket, group in x_groups.items():
        # Sort by Y within the group
        group.sort(key=lambda r: r["bbox"]["y"])

        merged = [group[0]]

        for region in group[1:]:
            prev = merged[-1]

            # Current region must be small; accumulated can be larger
            curr_small = region["lines"] <= 2 and len(region["text"]) < 40
            prev_not_huge = prev["lines"] <= 10 and len(prev["text"]) < 250

            if not (prev_not_huge and curr_small):
                merged.append(region)
                continue

            # Check left alignment (within 0.03)
            if abs(prev["bbox"]["x"] - region["bbox"]["x"]) > 0.03:
                merged.append(region)
                continue

            # Check line height similarity (within 60%)
            # Relaxed from 0.6 to 0.4 so stacked title lines with different
            # font sizes (e.g. Polish name + Korean romanized subtitle) merge.
            prev_h = prev["mean_line_height"]
            curr_h = region["mean_line_height"]
            if prev_h > 0 and curr_h > 0:
                h_ratio = min(prev_h, curr_h) / max(prev_h, curr_h)
            else:
                h_ratio = 0
            if h_ratio < 0.4:
                merged.append(region)
                continue

            # Check vertical proximity (gap < 0.08)
            prev_bottom = prev["bbox"]["y"] + prev["bbox"]["height"]
            curr_top = region["bbox"]["y"]
            gap = curr_top - prev_bottom
            if gap > 0.08:
                merged.append(region)
                continue

            # Merge
            combined_obs = prev["observations"] + region["observations"]
            all_x = [o["bbox"]["x"] for o in combined_obs]
            all_y = [o["bbox"]["y"] for o in combined_obs]
            all_r = [o["bbox"]["x"] + o["bbox"]["width"] for o in combined_obs]
            all_b = [o["bbox"]["y"] + o["bbox"]["height"] for o in combined_obs]

            sorted_obs = sorted(combined_obs, key=lambda o: (round(o["bbox"]["y"], 2), round(o["bbox"]["x"], 2)))
            text = " ".join(o["text"] for o in sorted_obs)

            bbox_x = min(all_x)
            bbox_y = min(all_y)
            bbox_w = max(all_r) - bbox_x
            bbox_h = max(all_b) - bbox_y
            area = bbox_w * bbox_h if bbox_w > 0 and bbox_h > 0 else 1

            merged[-1] = {
                "observations": combined_obs,
                "bbox": {"x": bbox_x, "y": bbox_y, "width": bbox_w, "height": bbox_h},
                "lines": prev["lines"] + region["lines"],
                "text": text,
                "char_density": len(text) / area,
                "mean_line_height": statistics.mean(o["bbox"]["height"] for o in combined_obs),
            }

        merged_all.extend(merged)

    return merged_all


def _cluster_column(observations, y_tolerance, region_gap):
    """Cluster observations within a single column into regions."""
    if not observations:
        return []

    # Step 1: Sort by Y
    sorted_obs = sorted(observations, key=lambda o: o["bbox"]["y"])

    # Step 2: Group into horizontal bands by Y proximity
    raw_bands = []
    current_band = [sorted_obs[0]]

    for obs in sorted_obs[1:]:
        prev = current_band[-1]
        y_diff = abs(obs["bbox"]["y"] - prev["bbox"]["y"])
        if y_diff < y_tolerance:
            current_band.append(obs)
        else:
            raw_bands.append(current_band)
            current_band = [obs]
    raw_bands.append(current_band)

    # Step 2b: Sub-split bands by height similarity.
    # Within each Y-band, separate observations with different font sizes.
    # Sort by height, then split where consecutive heights differ by >20%.
    # Re-sort each sub-band by Y to preserve reading order.
    bands = []
    for raw_band in raw_bands:
        if len(raw_band) <= 1:
            bands.append(raw_band)
            continue
        by_height = sorted(raw_band, key=lambda o: o["bbox"]["height"])
        sub_band = [by_height[0]]
        for obs in by_height[1:]:
            prev_h = sub_band[-1]["bbox"]["height"]
            curr_h = obs["bbox"]["height"]
            ratio = prev_h / curr_h if curr_h > 0 else 0
            if ratio > 0.8:  # within 20% of each other
                sub_band.append(obs)
            else:
                # Re-sort by Y before appending
                bands.append(sorted(sub_band, key=lambda o: o["bbox"]["y"]))
                sub_band = [obs]
        bands.append(sorted(sub_band, key=lambda o: o["bbox"]["y"]))

    # Step 3: Merge adjacent bands into regions
    # Only merge bands that have similar line heights (same font size zone)
    regions = [bands[0]]

    for band in bands[1:]:
        prev_region = regions[-1]
        prev_all = prev_region if not isinstance(prev_region[0], list) else [o for b in prev_region for o in b]

        # Compute vertical gap
        prev_max_bottom = max(o["bbox"]["y"] + o["bbox"]["height"] for o in prev_all)
        curr_min_top = min(o["bbox"]["y"] for o in band)
        gap = curr_min_top - prev_max_bottom

        # Compute X overlap
        prev_min_x = min(o["bbox"]["x"] for o in prev_all)
        prev_max_x = max(o["bbox"]["x"] + o["bbox"]["width"] for o in prev_all)
        curr_min_x = min(o["bbox"]["x"] for o in band)
        curr_max_x = max(o["bbox"]["x"] + o["bbox"]["width"] for o in band)

        overlap_start = max(prev_min_x, curr_min_x)
        overlap_end = min(prev_max_x, curr_max_x)
        overlap = max(0, overlap_end - overlap_start)
        narrower_width = min(prev_max_x - prev_min_x, curr_max_x - curr_min_x)
        x_overlap_ratio = overlap / narrower_width if narrower_width > 0 else 0

        # Check line height consistency — don't merge bands with different font sizes
        prev_mean_h = statistics.mean(o["bbox"]["height"] for o in prev_all)
        curr_mean_h = statistics.mean(o["bbox"]["height"] for o in band)
        if prev_mean_h > 0 and curr_mean_h > 0:
            height_ratio = min(prev_mean_h, curr_mean_h) / max(prev_mean_h, curr_mean_h)
        else:
            height_ratio = 0

        # Check line width consistency — a significant width drop signals a new zone
        # (e.g., title lines are wide, metadata lines that follow are narrow).
        # Compare the band's total X span against the region's typical span.
        prev_span = prev_max_x - prev_min_x
        curr_span = curr_max_x - curr_min_x
        if prev_span > 0 and curr_span > 0:
            width_ratio = min(prev_span, curr_span) / max(prev_span, curr_span)
        else:
            width_ratio = 0

        if gap < region_gap and x_overlap_ratio > 0.5 and height_ratio > 0.8 and width_ratio > 0.5:
            # Merge into current region
            regions[-1] = prev_all + band
        else:
            regions.append(band)

    # Step 4: Compute region properties
    result = []
    for region_obs in regions:
        # Flatten if nested
        if isinstance(region_obs[0], list):
            flat = [o for band in region_obs for o in band]
        else:
            flat = region_obs

        all_x = [o["bbox"]["x"] for o in flat]
        all_y = [o["bbox"]["y"] for o in flat]
        all_r = [o["bbox"]["x"] + o["bbox"]["width"] for o in flat]
        all_b = [o["bbox"]["y"] + o["bbox"]["height"] for o in flat]

        bbox_x = min(all_x)
        bbox_y = min(all_y)
        bbox_w = max(all_r) - bbox_x
        bbox_h = max(all_b) - bbox_y

        # Count lines by re-grouping observations within this region by Y
        line_groups = find_same_y_groups(flat, y_tolerance=y_tolerance)
        num_lines = len(line_groups)

        # Concatenate text (left-to-right within each line, top-to-bottom)
        # Quantize X to 0.01 so nearly-aligned observations sort by Y (reading order)
        text_parts = []
        for line_group in line_groups:
            sorted_line = sorted(line_group, key=lambda o: (round(o["bbox"]["x"], 2), o["bbox"]["y"]))
            text_parts.append(" ".join(o["text"] for o in sorted_line))
        text = " ".join(text_parts)

        area = bbox_w * bbox_h if bbox_w > 0 and bbox_h > 0 else 1
        char_density = len(text) / area
        mean_line_height = statistics.mean(o["bbox"]["height"] for o in flat)

        result.append({
            "observations": flat,
            "bbox": {"x": bbox_x, "y": bbox_y, "width": bbox_w, "height": bbox_h},
            "lines": num_lines,
            "text": text,
            "char_density": char_density,
            "mean_line_height": mean_line_height,
        })

    return result


def score_title_region(region, all_regions):
    """Score a region for title-likeness using the 6 features from spec 022."""
    # Line count score: sweet spot at 2-3 lines (typical titles).
    # Single lines are often OCR fragments; 4+ lines degrade gently.
    n = region["lines"]
    if n <= 1:
        line_count_score = 0.75  # single line — may be fragment
    elif n <= 3:
        line_count_score = 1.0   # sweet spot for titles
    elif n <= 6:
        line_count_score = max(0.2, 1 - (n - 3) / 5)
    else:
        line_count_score = 0.1

    # Relative line height: tallest mean_line_height among all regions
    max_mlh = max(r["mean_line_height"] for r in all_regions)
    relative_line_height = region["mean_line_height"] / max_mlh if max_mlh > 0 else 0

    # Vertical position: strong preference for top of page.
    # Titles almost always appear in the top 30%. Score drops sharply after that.
    y = region["bbox"]["y"]
    if y < 0.3:
        vertical_position = 1.0
    elif y < 0.5:
        vertical_position = 0.5
    else:
        vertical_position = 0.1

    # Character density: low density = big font
    max_density = max(r["char_density"] for r in all_regions)
    char_density_score = 1 - min(region["char_density"] / max_density, 1) if max_density > 0 else 0

    # Text length: short text high
    text_length_score = max(0, 1 - len(region["text"]) / 100)

    # ALL_CAPS boost, scaled by relative line height.
    # Small ALL_CAPS subtitles (e.g. Korean romanization) should not outscore
    # larger mixed-case titles that have the tallest font on the page.
    alpha_chars = [c for c in region["text"] if c.isalpha()]
    upper_ratio = sum(1 for c in alpha_chars if c.isupper()) / len(alpha_chars) if alpha_chars else 0
    caps_boost = (1.0 if upper_ratio > 0.8 else 0.0) * relative_line_height

    # Region width: titles span a meaningful portion of the page.
    # Narrow regions (< 0.10) are often OCR noise from book gutters/edges.
    region_width = region["bbox"]["width"]
    width_score = min(region_width / 0.30, 1.0)

    # Gutter noise penalty: narrow regions near the page edge with abnormally
    # tall line heights are garbled OCR from the book spine/gutter, not real text.
    # Real titles are wider (>0.20) and positioned away from the page edge.
    gutter_penalty = 0.0
    if (region["mean_line_height"] > 0.035
            and region["bbox"]["width"] < 0.20
            and region["bbox"]["x"] < 0.10):
        gutter_penalty = 0.3

    return (
        0.20 * line_count_score
        + 0.15 * relative_line_height
        + 0.25 * vertical_position
        + 0.10 * char_density_score
        + 0.05 * text_length_score
        + 0.15 * caps_boost
        + 0.10 * width_score
        - gutter_penalty
    )


def validate_title_text(text):
    """Light text validation — reject obvious non-titles."""
    if len(text) < 4 or len(text) > 200:
        return False
    if _MEASUREMENT_RE.search(text):
        return False
    # Check against section labels (strip diacritics, case-insensitive)
    cleaned = strip_diacritics(text.strip().rstrip(":").lower())
    if cleaned in _SECTION_LABELS:
        return False
    # Reject Polish recipe metadata blocks (servings/timing lines, not titles)
    if _RECIPE_METADATA_RE.search(strip_diacritics(text)):
        return False
    return True


def _strip_trailing_ingredients(text):
    """Strip ingredient/recipe text that got merged after the title.

    When a title region accidentally includes ingredient lines below it
    (e.g. "MAFTOUL SALAD 2 tablespoons extra-virgin..."), extract just
    the title portion before the first measurement.
    """
    m = _MEASUREMENT_RE.search(text)
    if not m:
        return text
    prefix = text[: m.start()].strip()
    # Remove trailing numbers left after truncation (e.g. "TITLE 3" → "TITLE")
    prefix = re.sub(r"\s+\d+\s*$", "", prefix).strip()
    if len(prefix) >= 4:
        return prefix
    return text


def _extract_leading_title(region):
    """Extract title from the leading observation(s) of a large region.

    In many cookbooks, the recipe title is the first text element in a region,
    followed by body text.  When the full region text is too long for a title,
    extract just the short leading observation(s).
    """
    obs = sorted(region["observations"],
                 key=lambda o: (round(o["bbox"]["y"], 2), o["bbox"]["x"]))
    if not obs:
        return None

    first = obs[0]
    # First observation must be short (title-like), start with an uppercase
    # letter (titles are Title Case or ALL CAPS), and not end with a period
    # (which would indicate a sentence / body text).
    if len(first["text"]) > 60 or len(first["text"]) < 4:
        return None
    first_alpha = next((c for c in first["text"] if c.isalpha()), None)
    if first_alpha and first_alpha.islower():
        return None
    if first["text"].rstrip().endswith("."):
        return None

    # Collect observations on the same Y band as the first (multi-word titles)
    y_tol = 0.03
    title_obs = [first]
    for o in obs[1:]:
        if abs(o["bbox"]["y"] - first["bbox"]["y"]) < y_tol and len(o["text"]) <= 40:
            title_obs.append(o)
        else:
            break

    title_obs.sort(key=lambda o: o["bbox"]["x"])
    return " ".join(o["text"] for o in title_obs)


def heuristic_region_clustering(observations, y_tolerance=0.05, region_gap=0.04):
    """Cluster into regions, score for title, validate. Return best title text."""
    regions = cluster_into_regions(observations, y_tolerance, region_gap)

    if not regions:
        return None

    # Score all regions
    scored = [(score_title_region(r, regions), r) for r in regions]
    scored.sort(key=lambda x: -x[0])

    # Greedy multi-region merge: start with the best region and iteratively
    # absorb nearby short-text regions that score >= 0.50.  This handles
    # multi-line titles split across regions (e.g. foreign name + Polish
    # subtitle, or word-per-line artistic layouts) that _merge_stacked_title_lines
    # misses when lines aren't left-aligned or have different font sizes.
    primary_text = None
    primary_y = None
    used_regions = set()

    s1, r1 = scored[0]
    if s1 >= 0.55:
        acc_y_top = r1["bbox"]["y"]
        acc_y_bot = r1["bbox"]["y"] + r1["bbox"]["height"]
        acc_x_left = r1["bbox"]["x"]
        acc_x_right = r1["bbox"]["x"] + r1["bbox"]["width"]
        merged_regions = [r1]

        remaining = [(s, r) for s, r in scored[1:] if s >= 0.50]
        changed = True
        while changed:
            changed = False
            new_remaining = []
            for s, r in remaining:
                r_top = r["bbox"]["y"]
                r_bot = r["bbox"]["y"] + r["bbox"]["height"]

                # Must be directly above or below accumulated region
                gap_above = acc_y_top - r_bot
                gap_below = r_top - acc_y_bot
                if gap_above > 0 and gap_below > 0:
                    vertical_gap = min(gap_above, gap_below)
                elif gap_above <= 0 and gap_below <= 0:
                    vertical_gap = 0  # overlapping
                else:
                    vertical_gap = max(gap_above, gap_below)
                if vertical_gap > 0.10:
                    new_remaining.append((s, r))
                    continue

                # Short text only (title-like, not body paragraphs)
                if len(r["text"]) > 50:
                    new_remaining.append((s, r))
                    continue

                # No recipe metadata
                if _RECIPE_METADATA_RE.search(strip_diacritics(r["text"])):
                    new_remaining.append((s, r))
                    continue

                # Require horizontal overlap or close proximity.
                # Short regions (single-word category labels like "TŁUSTE",
                # "KWAŚNE") can sit to the right of the title with a larger
                # horizontal gap — allow up to 0.15 gap for short text.
                r_left = r["bbox"]["x"]
                r_right = r["bbox"]["x"] + r["bbox"]["width"]
                x_overlap = min(acc_x_right, r_right) - max(acc_x_left, r_left)
                x_gap_limit = -0.15 if len(r["text"]) < 15 else -0.05
                if x_overlap <= x_gap_limit:
                    new_remaining.append((s, r))
                    continue

                # Merge this region
                merged_regions.append(r)
                acc_y_top = min(acc_y_top, r_top)
                acc_y_bot = max(acc_y_bot, r_bot)
                acc_x_left = min(acc_x_left, r_left)
                acc_x_right = max(acc_x_right, r_right)
                changed = True
            remaining = new_remaining

        if len(merged_regions) > 1:
            merged_regions.sort(key=lambda r: r["bbox"]["y"])
            merged_text = _strip_trailing_ingredients(
                " ".join(r["text"] for r in merged_regions)
            )
            if validate_title_text(merged_text):
                primary_text = merged_text
                primary_y = merged_regions[0]["bbox"]["y"]
                used_regions = {id(r) for r in merged_regions}

    # Try top 3 candidates individually if no merged title found
    if primary_text is None:
        for score, region in scored[:3]:
            text = _strip_trailing_ingredients(region["text"])
            if validate_title_text(text):
                primary_text = text
                primary_y = region["bbox"]["y"]
                used_regions = {id(region)}
                break
            # For regions too long to be titles, try extracting just the
            # leading observation(s) which are often the recipe title
            # followed by body text in the same cluster.
            if len(region["text"]) > 200:
                leading = _extract_leading_title(region)
                if leading and validate_title_text(leading):
                    primary_text = leading
                    primary_y = region["bbox"]["y"]
                    used_regions = {id(region)}
                    break

    if primary_text is None:
        return None

    # Multi-recipe page detection: look for additional title-like regions
    # that are well-separated from the primary title.  On pages with 2-3
    # recipes, each recipe title has a notably larger font than body text.
    max_mlh = max(r["mean_line_height"] for r in regions)
    additional = []
    for _score, region in scored:
        if id(region) in used_regions:
            continue
        # Must be well-separated vertically (different recipe section)
        y_gap = abs(region["bbox"]["y"] - primary_y)
        if y_gap < 0.15:
            continue
        # Must have large font relative to page (title-sized, not body)
        rel_h = region["mean_line_height"] / max_mlh if max_mlh > 0 else 0
        if rel_h < 0.55:
            continue
        # Must be short text (titles, not paragraphs)
        if len(region["text"]) > 60:
            continue
        # Must pass title validation
        text = _strip_trailing_ingredients(region["text"])
        if not validate_title_text(text):
            continue
        # Titles don't end with periods; body text sentences do
        if text.rstrip().endswith("."):
            continue
        additional.append((region["bbox"]["y"], text))

    if additional:
        additional.sort(key=lambda t: t[0])
        for _, text in additional:
            primary_text += " " + text

    return primary_text


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
        "region_clustering": heuristic_region_clustering,
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

    # ── Grid search for clustering thresholds ─────────────────────────────

    print("\n" + "=" * 60)
    print("GRID SEARCH: Region Clustering Thresholds")
    print("=" * 60)

    y_tols = [0.03, 0.04, 0.05, 0.06, 0.08]
    r_gaps = [0.02, 0.03, 0.04, 0.05, 0.06]

    best_accuracy = 0
    best_params = (0.05, 0.04)
    grid_results = []

    for yt in y_tols:
        for rg in r_gaps:
            matched_count = 0
            for m in matches:
                extracted = heuristic_region_clustering(
                    m["observations"], y_tolerance=yt, region_gap=rg
                )
                if titles_match(extracted, m["expected_title"]):
                    matched_count += 1
            acc = matched_count / len(matches) if matches else 0
            grid_results.append({
                "y_tolerance": yt,
                "region_gap": rg,
                "matched": matched_count,
                "total": len(matches),
                "accuracy": round(acc, 4),
            })
            if acc > best_accuracy:
                best_accuracy = acc
                best_params = (yt, rg)
            print(f"  y_tol={yt:.2f} gap={rg:.2f} → {acc:.1%} ({matched_count}/{len(matches)})")

    print(f"\nBest: y_tolerance={best_params[0]}, region_gap={best_params[1]} → {best_accuracy:.1%}")

    # Per-language breakdown for best params
    yt, rg = best_params
    for lang in ["pl", "en"]:
        lang_matches = [m for m in matches if m["lang"] == lang]
        if not lang_matches:
            continue
        lang_matched = sum(
            1 for m in lang_matches
            if titles_match(
                heuristic_region_clustering(m["observations"], y_tolerance=yt, region_gap=rg),
                m["expected_title"],
            )
        )
        print(f"  {lang}: {lang_matched}/{len(lang_matches)} = {lang_matched / len(lang_matches):.1%}")

    report["grid_search"] = {
        "best_params": {"y_tolerance": best_params[0], "region_gap": best_params[1]},
        "best_accuracy": best_accuracy,
        "all_results": grid_results,
    }

    # Re-write report with grid search results
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nUpdated report: {report_path}")


if __name__ == "__main__":
    main()

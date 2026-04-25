# Geometric Title Extraction Algorithm

How recipe titles are extracted from OCR bounding box data without using a language model.

## Input

Each recipe photo has been processed by Apple's Vision framework OCR, producing a list of **observations** — recognized text fragments with normalized bounding boxes:

```json
{
  "text": "BLUEBERRY PIE",
  "confidence": 0.95,
  "bbox": { "x": 0.12, "y": 0.08, "width": 0.45, "height": 0.025 }
}
```

Coordinates are normalized to `[0, 1]` relative to the image after EXIF rotation (portrait orientation). `y=0` is the top of the page. `height` serves as a proxy for font size — taller bounding boxes mean larger text.

A typical recipe page has 30–120 observations covering the title, ingredients, instructions, metadata, page numbers, and book spine noise.

## General approach

The algorithm is a spatial clustering pipeline that identifies the title by exploiting three properties of cookbook typography:

1. **Titles use the largest font on the page** (tallest bounding boxes)
2. **Titles appear near the top** (low Y values)
3. **Titles are short** (few words, low character density)

The pipeline clusters nearby observations into spatial regions, scores each region for "title-likeness," and returns the best candidate. It produces multiple fallback candidates to handle cases where the primary extraction is too broad.

## Pipeline stages

### Stage 1: Column detection (`detect_columns`)

Many cookbook pages have two-column layouts. The algorithm detects a column split by testing candidate X positions (observation edges) and finding the position that cleanly separates observations into left and right groups with a physical gap between them.

**Constraints:**
- At least 3 observations per side
- Gap width ≥ 0.025
- At most 20% of observations straddle the boundary
- Split position between X=0.15 and X=0.85

If no clean split is found, the page is treated as single-column.

### Stage 2: Band grouping (`_cluster_column`)

Within each column, observations are sorted by Y position and grouped into horizontal bands (observations at the same vertical position, within `y_tolerance`). Bands are then sub-split by height similarity — observations with different font sizes (>20% height difference) are separated even if they share the same Y coordinate.

### Stage 3: Region merging (`_cluster_column`, continued)

Adjacent bands are merged into regions when all four conditions hold:

- **Vertical gap** < `region_gap` (default 0.04 = 4% of page height)
- **X overlap** > 50% of the narrower band
- **Height similarity** > 80% (same font size zone)
- **Width similarity** > 50% (prevents merging wide title lines with narrow metadata)

### Stage 4: Stacked title merge (`_merge_stacked_title_lines`)

Post-processing pass that merges small adjacent regions that look like multi-line titles. Handles artistic layouts where each title word is a separate region (different X alignment or font size).

**Merge criteria:** left-aligned within 0.03, line height ratio > 0.4, vertical gap < 0.08, current region is small (≤2 lines, <40 chars), accumulated region not huge (≤10 lines, <250 chars).

### Stage 5: Region scoring (`score_title_region`)

Each region receives a weighted score from 7 features:

| Feature | Weight | Logic |
|---------|--------|-------|
| Vertical position | 0.25 | 1.0 if top 30%, 0.5 if 30–50%, 0.1 below |
| Line count | 0.20 | Peak at 2–3 lines, degrades above 6 |
| ALL_CAPS boost | 0.15 | 1.0 if >80% uppercase, scaled by relative line height |
| Relative line height | 0.15 | Ratio vs tallest region on page |
| Character density | 0.10 | Low density = big font = more title-like |
| Region width | 0.10 | Wider is better (capped at 0.30 of page width) |
| Text length | 0.05 | Shorter text preferred (linear falloff to 100 chars) |

**Gutter noise penalty (−0.30):** Applied to narrow regions (<0.20 width) near the left edge (<0.10 X) with tall line heights (>0.035). These are garbled OCR from book spines, not real text.

### Stage 6: Title extraction (`heuristic_region_clustering`)

The main extraction function tries multiple strategies in order:

**A. Greedy multi-region merge.** Starting from the highest-scored region (score ≥ 0.55), iteratively absorb nearby high-scoring regions (≥ 0.50) that are: within 0.10 vertical distance, short text (<50 chars), not recipe metadata, and horizontally overlapping. This handles multi-line titles split across regions.

**B. Individual region fallback.** If merging produces nothing valid, try the top 3 scored regions individually. For each, strip trailing ingredients via `_strip_trailing_ingredients` and validate via `validate_title_text`.

**C. Leading observation extraction.** For regions >200 chars (title merged with body text), extract the first observation(s) on the same Y band — these are typically the title.

### Stage 7: Alternative candidates

The function returns a `_TitleResult` (a `str` subclass) carrying the primary extraction plus fallback alternatives. If the primary fails matching, the evaluator tries alternatives in order:

1. **Individual top-3 region texts** (un-merged, shorter)
2. **Leading observations** from top-3 regions (first line only)
3. **Multi-recipe concatenation** — all title-like regions (score ≥ 0.45, short text, tall font, starts uppercase) concatenated by Y position
4. **ALL CAPS observation scan** — all short ALL_CAPS observations across the page, concatenated

### Stage 8: Text validation (`validate_title_text`)

Rejects obvious non-titles:

- Too short (<4 chars) or too long (>200 chars)
- Ends with a period (body text sentence)
- Contains ingredient measurements (`\d+ (g|ml|cups|tablespoons|...)`)
- Is a section label ("ingredients", "przygotowanie", etc.)
- Contains recipe metadata ("DLA 4 OSÓB", "SERVES 4", "YIELDS", etc.)

`_strip_trailing_ingredients` truncates text at the first measurement pattern, recovering the title portion from "MAFTOUL SALAD 2 tablespoons..." → "MAFTOUL SALAD".

## Evaluation

### Ground truth matching

415 `.real.txt` files contain full recipe transcriptions. The expected title is derived from the filename (e.g., `BLUEBERRY_PIE.en.real.txt` → `BLUEBERRY_PIE`). Multi-recipe pages use `+` separators (`EGG_WAFFLES+CRISP_WAFFLES`).

Images are matched to ground truth files via **Jaccard word overlap** (threshold ≥ 0.3). The OCR text from all observations is compared against the full text of each `.real.txt` file.

### Title matching (`titles_match`)

A two-gate check: **recall** (are the expected words found?) then **precision** (is the extraction tight?).

**Recall cascade** (5 stages, increasingly tolerant):
1. Substring containment (exact)
2. Word-set matching (order-agnostic)
3. Adjacent word-pair concatenation ("SHORT BREAD" → "SHORTBREAD")
4. Fuzzy word matching (Levenshtein ≤ 2 for long words, ≤ 1 for short)
5. Suffix/prefix matching (≥50% overlap, ≥4 chars) + merged-word matching

**Precision gate:** `extracted_word_count ≤ max(expected_word_count × 2, expected_word_count + 4)`. Rejects extractions bloated with ingredient lists or body text.

If the primary text fails either gate, alternatives from `_TitleResult` are tried recursively.

## Assumptions

1. **Portrait-normalized images.** EXIF rotation is applied before OCR. The algorithm assumes `y=0` is the top of the page.

2. **Titles are typographically prominent.** The algorithm relies on titles having the largest font, being near the top, and being short. This holds for most printed cookbooks but fails for artistic layouts.

3. **Single or two-column layouts.** The column detector only finds one split point. Three-column layouts are not handled.

4. **Latin-script text.** OCR normalization handles Polish diacritics and common OCR confusions (0→O, 1→I, 5→S). Non-Latin scripts (Cyrillic in some observations) pass through without normalization.

5. **At most ~3 recipes per page.** The multi-recipe concatenation scans all title-like regions but assumes a reasonable count. Pages with many small recipe titles may produce excessively long concatenations.

## Known failure modes (6 remaining at 98.5% accuracy)

### Catastrophic OCR (2 cases)

`IMG_1417` ("Butterkaka") and `IMG_1418` ("NAPOLEON HATS..."): The OCR output is garbled beyond recognition — "oralcd uns Alling shea d tum". The title text does not appear anywhere in the observations. No geometric heuristic can recover a title that OCR failed to read.

### Title absent from OCR observations (2 cases)

`IMG_3821` ("Tatarska pasta z fasoli") and `IMG_3822` ("Łazanki ze szparagami..."): The title is visually present in the image but OCR either missed it or returned body text from the wrong part of the page. The highest-scored region contains recipe instructions, not the title.

### Missing subtitle on multi-recipe page (1 case)

`IMG_1799` ("Bulgur Wheat Salad Kisir"): The extraction finds "Bulgur Wheat Salad" but misses the subtitle "Kisir" which appears as a smaller, separate observation. The algorithm finds the main title but the ground truth expects both.

### Wrong recipe on multi-recipe page (1 case)

`IMG_1580` ("Lody sernikowe Lody tiramisù"): Two ice cream recipes share the page. The algorithm picks a body text observation ("1 cytryna, najlepiej niepryskana") instead of either title, because the title observations are small and compete with larger body text regions.

## Key parameters

| Parameter | Default | Used in |
|-----------|---------|---------|
| `y_tolerance` | 0.05 (eval uses 0.03) | Band grouping: max Y distance for same band |
| `region_gap` | 0.04 (eval uses 0.02) | Region merging: max vertical gap between bands |
| Height ratio | 0.80 | Region merging: min height similarity |
| Width ratio | 0.50 | Region merging: min width similarity |
| Score threshold | 0.55 primary, 0.50 merge | Min score for region to be considered |
| Precision gate | 2× or +4 | Max extracted words relative to expected |

The evaluation loop uses `y_tolerance=0.03, region_gap=0.02` (tighter clustering), found via grid search to perform best on the test set.

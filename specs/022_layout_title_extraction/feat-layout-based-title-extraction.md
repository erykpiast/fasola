# Layout-Based Title Extraction via OCR Region Clustering

**Status:** Draft
**Authors:** Claude, 2026-03-29

## Overview

Extract recipe titles by reconstructing the visual layout of cookbook pages from OCR bounding box data. Cluster individual OCR observations into semantic regions (title, ingredients, instructions, metadata), then classify each region by structural features to identify the one containing the title. This supersedes the naive per-observation geometric scoring from spec 021.

## Background / Problem Statement

### What we learned from spec 021

Spec 021 proposed scoring individual OCR observations by spatial features (height, position, width, isolation). The bbox analysis on 407 real recipe images revealed fundamental problems:

| Finding | Impact |
|---------|--------|
| **54 observations per image** (mean) | Apple Vision returns per-line observations, not semantic blocks |
| **100% fragmentation rate** | Every image has titles split across 2-5+ observations |
| **Best naive heuristic: 23.9%** | All four heuristics scored below 24% |
| **Body text heights ≈ title heights** | Raw bbox height doesn't differentiate font size |
| **Rotated coordinate system** | Many cookbook photos are portrait pages shot in landscape — Y is the short axis, X is the long axis in pixel space, breaking all Y-based heuristics |

The naive approach fails for two reasons: (1) it treats each observation independently instead of clustering, and (2) the bounding box coordinate system doesn't align with the page's reading orientation.

### The current title extraction problem

| Approach | PL real accuracy | EN real accuracy | Model size |
|----------|-----------------|-----------------|------------|
| BERT token classifier | 80.2% (235/293) | 41.0% (50/122) | ~554 MB |
| Heuristic + MiniLM embeddings | ~100% (11 files) | unknown | ~80 MB |
| Naive geometric (spec 021) | ~10% | ~10% | 0 MB |

The BERT models are too large (>150 MB budget) and English accuracy is broken. The heuristic works well for Polish but depends on MiniLM embeddings (80 MB) and is unproven at scale for English. We need a lighter, more robust, language-agnostic approach.

### Key insight

Cookbook pages have predictable visual structure: title region (big, isolated, top), ingredients (columnar list with numbers/units), instructions (dense paragraphs), metadata (serving size, time, small text). **By clustering nearby observations into regions first, then classifying each region by its aggregate properties**, we can leverage structural regularity without understanding the text content.

## Goals

- Normalize image orientation to portrait before OCR, so bounding box coordinates align with reading direction
- Cluster OCR bounding box observations into spatial regions representing semantic zones
- Score regions for "title-likeness" using aggregate geometric features
- Extract the title from the highest-scoring region
- Achieve ≥80% accuracy on both PL and EN real test corpora (beating BERT's 80%/41%)
- Zero additional model weight — pure clustering + rules
- Language-agnostic region detection, with minimal text validation
- Integrate with the `expo-text-extractor` bounding box API from spec 021

## Non-Goals

- Training any ML models
- Extracting ingredients or instructions (only title for now)
- Modifying the web/Tesseract.js OCR path (web continues using heuristic text extraction)
- Replacing tag/label classification (MiniLM embeddings remain for tags)
- Handling handwritten recipes or non-cookbook layouts (menus, blog screenshots)

## Technical Dependencies

- **expo-text-extractor** local module (from spec 021) — provides `extractTextWithBounds()` returning `TextObservation[]` with normalized bounding boxes
- **Apple Vision** (iOS) / **ML Kit** (Android) — upstream OCR engines
- **HEIC/EXIF orientation metadata** — available via `CGImageSource` (iOS) or `ExifInterface` (Android)
- **Existing heuristic title extractor** (`lib/text-classifier/title-extractor.ts`) — fallback for web and edge cases

## Detailed Design

### Pre-OCR: Image orientation normalization

#### The problem

Apple Vision and ML Kit return bounding boxes relative to the image's **pixel grid**, not its display orientation. A portrait cookbook page photographed in landscape mode has its Y-axis running along the page's horizontal (reading) direction. This means `y` encodes horizontal position and `height` encodes horizontal span — the opposite of what the clustering algorithm needs.

In the bbox dataset, this manifests as observations with very narrow `width` (0.015–0.07) and very tall `height` (0.13–0.50), where the "height" is actually the text's horizontal reading span.

#### The solution

Normalize the image to portrait orientation **before** passing it to the OCR engine. This ensures bounding box Y always corresponds to vertical page position and height always corresponds to line height (font size proxy).

**iOS implementation:** Read the EXIF orientation tag from the image. If the image is landscape (orientation tags 5-8, or pixel width > pixel height), rotate the `CGImage` to portrait before passing to `VNImageRequestHandler`. Apple's `UIImage(cgImage:scale:orientation:)` can apply the rotation, then extract a new `CGImage` from the correctly-oriented `UIImage`.

**Android implementation:** Read EXIF orientation via `ExifInterface`. If landscape, use `Matrix.postRotate()` to rotate the `Bitmap` to portrait before creating the `InputImage`.

**Python evaluation script:** Use `CGImageSourceCopyPropertiesAtIndex` to read EXIF orientation and rotate via `Quartz.CGImageCreate` with a transform, or use `PIL.Image.open().rotate()` with EXIF auto-rotation.

After normalization:
- `y` = vertical position on the page (0 = top, 1 = bottom)
- `x` = horizontal position (0 = left, 1 = right)
- `height` = line height in reading space (proxy for font size)
- `width` = horizontal text span

The clustering algorithm can then always assume portrait orientation.

### Phase 1: Region clustering

#### Algorithm: Agglomerative Y-clustering with region merging

OCR observations arrive as individual text lines scattered across the page. The clustering step groups them into rectangular regions.

```
Input:  [{text, bounds: {x, y, width, height}}, ...]   (54 observations avg)
Output: [{observations: [...], bbox: {x, y, width, height}, lines: n}, ...]  (5-15 regions)
```

**Step 1 — Sort by vertical position.** Order all observations by `y` (top of bounding box).

**Step 2 — Group into horizontal bands.** Merge consecutive observations whose vertical distance is below a threshold. Two observations are in the same band when:
- `|obs_a.y - obs_b.y| < Y_TOLERANCE` (default: 0.05 = 5% of image height)
- `min(obs_a.height, obs_b.height) / max(obs_a.height, obs_b.height) > 0.4` (similar line height)

Observations within a band are sorted left-to-right by `x`.

**Step 3 — Merge adjacent bands into regions.** Adjacent bands are merged into the same region when the vertical gap between the bottom of one band and the top of the next is below a gap threshold:
- `gap = next_band.min_y - current_band.max_y_bottom`
- Merge if `gap < REGION_GAP_THRESHOLD` (default: 0.04 = 4% of image height)
- Merge if the bands share similar X-extent (overlap > 50% of the narrower band's width)

**Step 4 — Compute region properties.** For each merged region:
```
region.bbox = bounding box enclosing all observations in the region
region.lines = number of horizontal bands in the region
region.text = concatenated text of all observations (left-to-right, top-to-bottom)
region.char_density = len(region.text) / (region.bbox.width * region.bbox.height)
region.mean_line_height = mean of all observation heights in the region
```

**Edge case — fewer than 3 regions:** If clustering produces fewer than 3 regions, relative scoring features become meaningless (e.g., "largest font among all regions" is trivially satisfied). In this case, fall back unconditionally to the heuristic text extractor.

### Phase 2: Region classification — title scoring

Each region gets a title score. The highest-scoring region's text is the title candidate.

#### Title region features

| Feature | Scoring | Weight |
|---------|---------|--------|
| **Line count** | 1-3 lines → high, 4+ → low | `score = max(0, 1 - (lines - 1) / 4)` |
| **Relative line height** | Tallest mean_line_height among all regions → high | `score = region.mean_line_height / max_mean_line_height` |
| **Vertical position** | Top of page → higher | `score = 1 - region.bbox.y` |
| **Character density** | Low density = big font with spacing → high | `score = 1 - min(region.char_density / max_density, 1)` |
| **Text length** | Short text (< 100 chars) → high | `score = max(0, 1 - len(text) / 100)` |
| **ALL_CAPS ratio** | High ratio of uppercase → boost | `+0.15 if >80% uppercase` |

**Combined score:**
```
title_score = 0.25 * line_count_score
            + 0.25 * relative_line_height
            + 0.15 * vertical_position
            + 0.15 * char_density_score
            + 0.10 * text_length_score
            + 0.10 * caps_boost
```

Note: `relative_line_height` replaces the previous `avg_char_width` feature. After orientation normalization, `mean_line_height` directly measures font size in reading space — taller observations mean larger text. This is simpler and more robust than dividing region width by character count.

Note: `vertical_position` uses the full 0-1 range (`1 - y`) rather than a hard cutoff at 0.5. Titles near the top score highest, but mid-page titles still get a non-zero score.

### Phase 3: Title extraction with validation

1. **Score all regions** for the title class
2. **Rank by title_score descending**
3. **Validate top candidate** against lightweight text filters:
   - Reject if region text matches ingredient patterns (measurement units: g, ml, cup, tbsp, łyżka, szklanka)
   - Reject if region text matches section header keywords (from existing `SECTION_LABELS` set in `title-extractor.ts`)
   - Reject if region text is a single character or exceeds 200 characters
4. **If top candidate rejected**, try second-highest. If top-3 all rejected, fall back to the heuristic text extractor.
5. **Return the region's concatenated text** as the extracted title

Ingredient/instruction/metadata region classifiers are **not needed for v1**. The title scoring features (line count, font size, position, density, text length, ALL_CAPS) should suffice to rank the title above other regions. Negative classifiers can be added later if the title score alone fails to achieve the accuracy target.

### File organization

```
lib/text-classifier/
  title-extractor-layout.ts     # NEW: clustering + region classification
  title-extractor.ts            # KEEP: heuristic fallback
  title-extractor-model.ts      # REMOVE: BERT token classification (deferred to impl phase 3)
  index.native.ts               # MODIFY: use layout extractor as primary
  index.web.ts                  # KEEP: unchanged
```

### Integration into classification pipeline

Same approach as spec 021 — thread `textBlocks: OcrTextBlock[]` from the OCR result through to `classifyText`:

```typescript
classifyText(
  text: string,
  method?: "embeddings" | "tfidf",
  language?: AppLanguage,
  textBlocks?: OcrTextBlock[]  // from expo-text-extractor
): Promise<ClassificationResult>
```

When `textBlocks` with bounds are present → layout-based extraction. Otherwise → heuristic text extraction (web path fallback).

## Data Flow

```
Photo
  ↓
[Photo Processor Pipeline]
  Phase 1-3: geometry, lighting, clarity
  Phase 4: Text Recognition
    ↓
  [Image Orientation Normalization]
    Read EXIF orientation → rotate to portrait if landscape
    ↓
  [OCR Bridge - Native]
    expo-text-extractor.extractTextWithBounds(portraitImage)
      → TextObservation[] with portrait-normalized bounds
    ↓
  OcrResult {
    text: "concatenated text...",
    textBlocks: [
      { text: "KREM SELEROWY",  bounds: {x: 0.15, y: 0.08, w: 0.70, h: 0.04} },
      { text: "Z GORGONZOLĄ",   bounds: {x: 0.25, y: 0.12, w: 0.50, h: 0.04} },
      { text: "DLA 4 OSÓB",     bounds: {x: 0.15, y: 0.18, w: 0.25, h: 0.02} },
      { text: "400 g selera...", bounds: {x: 0.15, y: 0.25, w: 0.30, h: 0.02} },
      ... more observations ...
    ]
  }
    ↓
[Region Clustering]
  Y-sort → band grouping → region merging
  → 6 regions:
    Region 0: {lines: 2, text: "KREM SELEROWY Z GORGONZOLĄ",
               mean_line_height: 0.04, char_density: low, y: 0.08}
    Region 1: {lines: 1, text: "DLA 4 OSÓB",
               mean_line_height: 0.02, char_density: low, y: 0.18}
    Region 2: {lines: 8, text: "400 g selera korzenio...",
               mean_line_height: 0.02, char_density: high, y: 0.25}
    ...
    ↓
[Title Scoring]
  Region 0: title_score=0.88 (2 lines, tallest font, top position, low density, short, ALL_CAPS)
  Region 1: title_score=0.42 (1 line, small font, near-top)
  Region 2: title_score=0.08 (8 lines, small font, mid-page, dense, long)
    ↓
[Text Validation]
  Region 0: "KREM SELEROWY Z GORGONZOLĄ" — no measurement units, not a section header → PASS
  → title: "KREM SELEROWY Z GORGONZOLĄ"
    ↓
[Tag Classification - Unchanged]
  → suggestions: [{ tag: "#soup", ... }, { tag: "#italian", ... }]
```

## User Experience

No visible changes. Title field auto-populates as before. Users may notice:
- More accurate English titles
- Faster extraction (no BERT model load)
- Title works immediately without model download

## Testing Strategy

### Unit tests

**Region clustering** (`title-extractor-layout.test.ts`):
- Given observations with known portrait-normalized bounds, verify correct region grouping
- Test Y-tolerance: observations 4% apart → same band; 6% apart → different bands
- Test X-overlap merge: adjacent bands with overlapping X-extent merge; non-overlapping don't
- Test region property computation: line count, char density, mean line height
- Test edge case: fewer than 3 regions → fallback triggered

**Title scoring:**
- Given a set of regions with known properties, verify the title region is selected
- Test ALL_CAPS boost differentiates title from metadata
- Test fallback when all regions are rejected by text validation
- Test that the top-scoring region changes when title features dominate

### Evaluation against existing corpus

**Critical prerequisite:** Before trusting accuracy numbers, reconcile the `extract_expected_title` function in `analyze_bboxes.py` with `eval_model.py`. The Python evaluation script must strip the same pattern suffixes (`.simple`, `.spillover`, `.split_title`, etc.) that `eval_model.py` strips, or accuracy comparisons will be invalid.

**Using the 407-image bbox dataset from spec 021:**

The evaluation must be re-run with orientation-normalized bounding boxes. This means updating `recognize_bboxes.py` to detect and apply EXIF rotation before OCR, then re-processing all 407 images.

Updated evaluation script implements the clustering algorithm and tests accuracy against:
- Naive geometric baselines (10-24% from spec 021)
- BERT model baselines (80% PL, 41% EN)

### Threshold tuning

The 2 clustering thresholds (Y_TOLERANCE, REGION_GAP_THRESHOLD) and 6 classification weights should be tuned against the dataset. Approach:
- Grid search over threshold values: Y_TOLERANCE in [0.03, 0.04, 0.05, 0.06], REGION_GAP in [0.02, 0.03, 0.04, 0.05]
- For each threshold combination, evaluate title scoring accuracy
- Report accuracy per language (PL vs EN)

## Performance Considerations

**Improvements over current approach:**
- Eliminates BERT model download (~554 MB total)
- Eliminates BERT load time and inference time
- Clustering + classification is O(n log n) where n = observations (~54), completes in <5ms

**Neutral:**
- Full-page OCR time unchanged
- Tag classification unchanged (still uses MiniLM)
- Image rotation adds negligible overhead (single `CGImage` transform before OCR)

## Security Considerations

No new security implications. All processing is on-device from user-provided images.

## Documentation

- Update `docs/architecture.md` with layout-based title extraction description
- Update `lib/text-classifier/CLASSIFIER.md`
- Update spec 021 status (superseded by this spec for the scoring approach; the module fork and bbox infrastructure remain valid)

## Implementation Phases

### Phase 1: Orientation normalization + re-run bbox extraction

- Update `recognize_bboxes.py` to detect EXIF orientation and rotate images to portrait before OCR
- Re-process all 407 images to get portrait-normalized bounding boxes
- Fix `extract_expected_title` in `analyze_bboxes.py` to match `eval_model.py`

### Phase 2: Clustering algorithm + evaluation

- Implement region clustering in `analyze_bboxes.py` (Python, for rapid iteration)
- Implement title scoring with the 6 features
- Evaluate against the portrait-normalized bbox dataset
- Tune thresholds and weights using grid search
- Target: ≥60% accuracy (proving the approach works)

### Phase 3: TypeScript implementation + integration

- Update `expo-text-extractor` native module to rotate images to portrait before OCR
- Port the tuned clustering + scoring algorithm to `lib/text-classifier/title-extractor-layout.ts`
- Wire into `index.native.ts` classification flow
- Unit tests for clustering and scoring
- Target: match or exceed Python evaluation accuracy

### Phase 4: BERT removal + validation

- Remove `title-extractor-model.ts` and BERT model infrastructure
- On-device validation with real recipe images
- Compare against BERT baselines
- Update documentation

## Open Questions

1. **Optimal clustering thresholds**: Y_TOLERANCE and REGION_GAP_THRESHOLD need empirical tuning. The 407-image dataset should provide enough signal, but different cookbook styles may need different thresholds.

2. **Two-page spreads**: When a user photographs two pages, there are two title regions. The scoring algorithm picks the most prominent one. Is this acceptable?

3. **Interaction with heuristic extractor**: Should the text validation step reuse the exact filtering logic from `title-extractor.ts`, or a simplified subset? Reusing ensures consistency but creates a coupling.

4. **MiniLM dependency for tags**: This spec only addresses title extraction. The MiniLM model (80 MB) remains for tag classification. Removing it is out of scope but could be a follow-up.

5. **Need for negative classifiers**: If title scoring alone doesn't achieve ≥80% accuracy, add ingredient/instruction/metadata exclusion classifiers. Defer until Phase 2 results are in.

## References

- [Spec 021: Geometric Title Extraction](../021_geometric_title_extraction/feat-geometric-title-extraction.md) — predecessor, provides bbox infrastructure
- [PR #32](https://github.com/erykpiast/fasola/pull/32) — expo-text-extractor fork + bbox analysis scripts
- [Spec 019: Title Extraction Loop](../019_title_extraction_loop/feat-title-extraction-self-improving-loop.md) — heuristic improvement loop
- Bbox analysis report: `tools/title-loop/bboxes/_analysis_report.json` (407 images, 405 matched)
- Existing text filters: `lib/text-classifier/title-extractor.ts` (66 section labels, cooking verbs, ingredient patterns)
- Apple Vision VNRecognizedTextObservation — per-line observations with bounding boxes

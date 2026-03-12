---
schema: 1
id: 4
title: Page dewarping doesn't really work for any photos
status: planned
created: "2026-03-09T22:52:42.560Z"
updated: "2026-03-09T22:52:42.560Z"
tags:
  - bug
dependencies: []
---

We must test photos with all four corners visible but also those without.

## Implementation Plan

## Relevant Files

- **`lib/photo-processor/pipelines/geometry/dewarp-pipeline.ts`** — Main dewarping pipeline used on native (via WebView). Entry point `processDewarp()`. This is the code path that actually runs.
- **`lib/photo-processor/pipelines/geometry/config.ts`** — Global config constants for contour detection, image sizing, margins, optimization.
- **`lib/photo-processor/pipelines/geometry/mask.ts`** — Binary text mask generation via adaptive thresholding and morphological ops.
- **`lib/photo-processor/pipelines/geometry/contours.ts`** — Text contour detection with geometry filters (min width/height/aspect/thickness).
- **`lib/photo-processor/pipelines/geometry/spans.ts`** — Assembles contours into horizontal text line spans, samples keypoints.
- **`lib/photo-processor/pipelines/geometry/projection.ts`** — Projects 2D page coords to image coords using the cubic surface + camera pose. Only models curvature in x-direction (2 coefficients).
- **`lib/photo-processor/pipelines/geometry/solve.ts`** — Computes initial camera pose via `solvePnP` from page corners.
- **`lib/photo-processor/pipelines/geometry/optimise.ts`** — Powell's method optimization for cubic sheet + span fitting.
- **`lib/photo-processor/pipelines/geometry/utils.ts`** — `pix2norm`/`norm2pix` coordinate conversion, image loading.
- **`lib/photo-processor/opencv-bridge/webview-bridge.ts`** — Bridge that calls `processDewarp` inside WebView on native.
- **`lib/photo-processor/types.ts`** — `PhotoAdjustmentConfig` with geometry config, `DEFAULT_CONFIG`.
- **`lib/photo-processor/opencv-bridge/index.native.tsx`** — Native WebView bridge with 30s timeout.
- **`lib/photo-processor/pipelines/geometry/opencv-core.ts`** — Alternative pipeline (used by web path). Has a separate cubic sheet model with 16 coefficients, different projection math.
- **`lib/photo-processor/pipelines/geometry/page-dewarp-remap.ts`** — Map generation + remap for the alternative pipeline. Uses `project3DTo2D` (simplistic pinhole) that doesn't match Zucker's `projectXY`.
- **`lib/photo-processor/optimization/dewarp-optimizer.ts`** — Span refinement + Levenberg-Marquardt cubic sheet fitting for alternative pipeline.

## Analysis

### Two Pipelines, Neither Works Well

The codebase has **two independent dewarping pipelines** that don't share code:

1. **Zucker pipeline** (`dewarp-pipeline.ts`) — Based on Matt Zucker's `page_dewarp.py`. Used on **native** via WebView bridge. Uses proper PnP pose estimation, 2-coefficient cubic model (curvature in x only), Powell's method optimization.
2. **Alternative pipeline** (`opencv-core.ts` + `page-dewarp-remap.ts` + `dewarp-optimizer.ts`) — Used on **web**. Has a 16-coefficient cubic sheet model, Levenberg-Marquardt fitting, and a simplistic pinhole projection (`focalLength / (focalLength + z)`) that is mathematically inconsistent with the Zucker pipeline's Rodrigues rotation-based projection.

### Core Problems

**1. No document boundary detection.** `calculatePageExtents()` in `dewarp-pipeline.ts:307-334` simply creates a rectangular mask with fixed margins (`PAGE_MARGIN_X=50, PAGE_MARGIN_Y=20`). It does **not** detect actual page edges. This means:
- If the page only covers part of the image, the "page mask" includes background
- If the page is rotated/skewed, the mask doesn't account for it
- Contours from non-page areas pollute the span assembly

**2. Text contour detection is tuned for ideal document scans.** The parameters in `config.ts` and `contours.ts` assume clean, printed text on white background:
- `TEXT_MIN_WIDTH: 15` — Too small for a 1280-wide image (contours at this scale are noise)
- `TEXT_MAX_THICKNESS: 10` — Too restrictive for photos with thick fonts or decorative text
- `SCREEN_MAX_W: 1280, SCREEN_MAX_H: 700` — The downscaled image is tiny, causing text features to fall below detection thresholds
- Recipe photos often have decorative fonts, handwritten text, images, and varied layouts that violate the "clean document" assumption

**3. Span assembly fails silently.** When fewer than 3 text spans are found (line 357 in `dewarp-pipeline.ts`), it tries line contours as a fallback. When even 1 span is missing (line 223), it returns the original image unchanged. No information is returned about *why* it failed.

**4. The alternative pipeline's math is inconsistent.** `page-dewarp-remap.ts:generateDewarpMaps()` uses `project3DTo2D` with `scale = focalLength / (focalLength + z)`, but the optimization in `dewarp-optimizer.ts:fitCubicSheet()` uses the same function. However, the Zucker pipeline uses proper rotation matrices via `cv.Rodrigues`. These two projection models are fundamentally different, so the web and native paths produce different results.

**5. Flat sheet fallback is a no-op.** When `fitCubicSheet` finds no keypoints, it returns all-zero coefficients. In `generateDewarpMaps`, when z≈0, the mapping degenerates to simple image resizing to fixed 1200×1600 output — not useful dewarping.

**6. No perspective correction.** For photos taken at an angle (common for cookbook photos), perspective distortion should be corrected first using a homography transform before attempting curvature correction. Neither pipeline does this.

### What the Task Requires

The task says "must test photos with all four corners visible but also those without." This points to implementing proper **document detection** that:
- Detects page corners when visible → perspective correction + dewarping
- Handles partial visibility → skip perspective, attempt dewarping on detected region
- Falls back gracefully → return original when detection confidence is low

## Steps

### Phase 1: Add Document Boundary Detection

**1. Create `lib/photo-processor/pipelines/geometry/document-detection.ts`**

Implement `detectDocumentBoundary()` that:
- Converts to grayscale, applies Gaussian blur
- Runs Canny edge detection
- Finds contours with `cv.findContours(RETR_EXTERNAL)`
- Filters for large quadrilateral contours using `cv.approxPolyDP`
- Scores candidates by area, convexity, and aspect ratio
- Returns `{ corners: [tl, tr, br, bl] | null, confidence: number, boundingRect: Rect }`

The function should handle:
- **4 corners visible**: Return all 4 corners with high confidence
- **Partial page**: Return `null` corners with the largest rectangle-like contour's bounding box
- **No page detected**: Return `null` with low confidence

```typescript
export interface DocumentBoundary {
  corners: [Point2D, Point2D, Point2D, Point2D] | null;
  confidence: number; // 0-1
  boundingRect: { x: number; y: number; width: number; height: number };
  isFullPage: boolean;
}

export function detectDocumentBoundary(
  cv: CV, 
  img: CVMat,
  config: { minAreaRatio: number; cannyLow: number; cannyHigh: number }
): DocumentBoundary
```

**2. Create `lib/photo-processor/pipelines/geometry/perspective-correction.ts`**

Implement `applyPerspectiveCorrection()` that:
- Takes 4 detected corners and applies `cv.getPerspectiveTransform` + `cv.warpPerspective`
- Computes output dimensions preserving aspect ratio
- Returns corrected image with straight page edges

```typescript
export function applyPerspectiveCorrection(
  cv: CV,
  img: CVMat,
  corners: [Point2D, Point2D, Point2D, Point2D]
): CVMat
```

### Phase 2: Rewrite the Main Pipeline to Use Detection

**3. Refactor `dewarp-pipeline.ts:processDewarp()`**

Replace `calculatePageExtents()` (fixed margin rectangle) with the new detection pipeline:

```
1. Load + resize image (existing)
2. detectDocumentBoundary() → NEW
3. If 4 corners detected with confidence > 0.7:
   a. applyPerspectiveCorrection() → perspective-corrected image
   b. Run dewarping on corrected image (existing contour→span→optimize→remap flow)
4. If partial page (confidence 0.3-0.7):
   a. Crop to detected bounding rect
   b. Use cropped region as page mask (replacing calculatePageExtents)
   c. Run dewarping on cropped region
5. If no page detected (confidence < 0.3):
   a. Return original image (skip dewarping entirely)
```

**4. Update `calculatePageExtents()` to use detected boundary**

Instead of fixed margins, use the detected bounding rect to create the page mask:

```typescript
function calculatePageExtents(
  cv: CV,
  small: CVMat,
  boundary: DocumentBoundary
): { pagemask: CVMat; page_outline: Array<[number, number]> }
```

### Phase 3: Tune Parameters for Recipe Photos

**5. Update `config.ts` thresholds**

Adjust for cookbook/recipe photo characteristics:
- `SCREEN_MAX_W: 1600` (from 1280) — keep more detail for detection
- `SCREEN_MAX_H: 1200` (from 700) — photos are typically portrait
- `TEXT_MAX_THICKNESS: 20` (from 10) — allow thicker decorative fonts
- `ADAPTIVE_WINSZ: 71` (from 55) — larger window for varied lighting in photos
- `SPAN_MIN_WIDTH: 20` (from 30) — allow shorter text lines (recipe ingredient lists)

**6. Update `mask.ts` morphological operations**

Increase the dilation kernel for text mode from `box(9, 1)` to `box(15, 1)` to better connect characters in photos where text may be lower contrast. Increase erosion kernel from `box(1, 3)` to `box(1, 5)` to better filter noise.

### Phase 4: Improve Failure Handling

**7. Add quality assessment to the pipeline result**

After dewarping, compare the dewarped result to the original to detect cases where dewarping made things worse:
- Compute image sharpness (Laplacian variance) of both
- If dewarped sharpness < 50% of original, return original instead
- Log the decision for debugging

In `dewarp-pipeline.ts:processDewarp()`, before returning the result:

```typescript
const originalSharpness = computeLaplacianVariance(cv, bgr);
const dewarpedSharpness = computeLaplacianVariance(cv, resultMat);
if (dewarpedSharpness < originalSharpness * 0.5) {
  console.log('[DewarpPipeline] Dewarped quality too low, returning original');
  return imageDataUrl;
}
```

**8. Return diagnostic info from processDewarp**

Add an optional return field with detection/dewarping metadata so the calling code can make informed decisions:

```typescript
interface DewarpResult {
  imageDataUrl: DataUrl;
  diagnostics?: {
    documentDetected: boolean;
    cornersFound: number;
    spansDetected: number;
    dewarpApplied: boolean;
    qualityDelta: number; // positive = improvement
  };
}
```

### Phase 5: Unify the Two Pipelines

**9. Align the web pipeline with the native pipeline**

The `opencv-core.ts` alternative pipeline should use the same Zucker-based dewarping as the native path. Replace the `generateDewarpMaps` + `applyDewarp` calls in `opencv-core.ts` with calls to the Zucker pipeline's `buildRemapMaps` + `applyRemap` from `dewarp-pipeline.ts`, or simply call `processDewarp` directly. This eliminates the inconsistent 16-coefficient flat sheet model.

## Testing

1. **Unit test for document detection**: Create test images with:
   - Full page with all 4 corners visible (white page on dark background)
   - Page with 1-2 corners cropped
   - No page (just food photo)
   - Page at an angle
   - Verify `detectDocumentBoundary` returns correct corners/confidence for each

2. **Integration test with real recipe photos**: Process a set of test photos through the full pipeline and verify:
   - Photos with clear page boundaries get perspective-corrected
   - Photos with no page boundaries are returned unchanged
   - Photos with curved pages get dewarped
   - Output quality (sharpness) is not worse than input

3. **Manual testing on device**: Build the app and test with:
   - Photographing an open cookbook (curved pages, 4 corners visible)
   - Photographing a recipe card held flat (no curvature)
   - Photographing a recipe printout on a table (perspective distortion)
   - Photographing a recipe with part of the page off-screen (missing corners)
   - Verify OCR accuracy improves or stays the same after dewarping changes

4. **Regression testing**: Run the processing pipeline on the existing photo collection and compare outputs before/after to ensure no degradation for photos that previously worked.

5. **Debug visualization**: Enable `collectDebugData: true` in the pipeline and inspect the debug images (binary text, detected contours, span estimates, keypoint cloud, mesh grid) for each test case to verify intermediate steps are working correctly.

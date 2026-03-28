# Geometric Title Extraction from OCR Bounding Boxes

**Status:** Draft
**Authors:** Claude, 2026-03-28

## Overview

Replace the BERT-based title token classifier with a language-agnostic geometric scoring function that ranks OCR text blocks by their visual/spatial properties (font size, vertical position, isolation, width). This eliminates ~132-500 MB of on-device BERT models while improving accuracy beyond the current 75% (PL) / 40% (EN) baselines.

## Background / Problem Statement

The current title extraction pipeline has two approaches, both operating on **text content only**:

1. **BERT token classification** (`title-extractor-model.ts`): Fine-tuned per-language models that label tokens as B-TITLE / I-TITLE / O. The Polish model (bert-base-polish-cased-v1, 132M params) is ~500 MB float32, and the English model (TinyBERT, 14.4M params) is ~54 MB. Even with INT8 quantization (spec 020), the PL model targets ~150 MB. Accuracy: 80% PL real / 41% EN real.

2. **Heuristic + embeddings** (`title-extractor.ts`): ~1100 lines of hand-tuned rules that filter OCR lines (reject ingredients, metadata, instructions) and score remaining candidates via MiniLM embedding similarity. Language-specific patterns make maintenance costly.

Both approaches fight the same fundamental problem: **they try to identify the title from text content after all spatial information has been discarded.** The OCR bridge (`expo-text-extractor`) returns `string[]` — just text, no positions or sizes.

Meanwhile, the underlying OCR engines (Apple Vision `VNRecognizedTextObservation` and ML Kit `TextBlock`) produce rich spatial data — bounding boxes, confidence scores, hierarchical structure — that is currently thrown away in the native module.

### Key insight

Cookbook titles are **visually distinctive by design**: large/bold font, positioned near the top, separated from body text by whitespace. A human identifies the title by *looking at the page layout*, not by reading every word. The geometric approach mirrors this: score text blocks by visual prominence, pick the winner, read only that text.

## Goals

- Expose bounding box data from `expo-text-extractor` on iOS (Apple Vision) and Android (ML Kit)
- Implement a geometric scoring function that ranks OCR text blocks by spatial features
- Add light text-based validation to reject obvious non-title blocks (ingredient lists, section headers)
- Remove dependency on BERT title extraction models (`title-extractor-model.ts`)
- Achieve accuracy >= 80% on both PL and EN real test corpora (beating current 80%/41%)
- Language-agnostic: no per-language models or training required
- Zero additional model weight for title extraction

## Non-Goals

- Changing tag/label classification (seasons, cuisines, categories) — those keep using MiniLM embeddings
- Training any new ML models — this is a pure geometric + heuristic approach
- Modifying the web/Tesseract.js OCR path (Tesseract returns different block structure; web can use existing heuristics as fallback)
- Removing the heuristic title extractor (`title-extractor.ts`) — it remains as fallback for web and edge cases
- Full-page OCR elimination — OCR of the entire page continues for tags, ingredients, and other metadata
- Modifying the OpenCV dewarping pipeline

## Technical Dependencies

- **expo-text-extractor** (currently v0.2.2) — needs native code changes to expose bounding boxes
- **Apple Vision framework** (iOS 13+) — `VNRecognizedTextObservation.boundingBox` returns normalized CGRect
- **Google ML Kit Text Recognition** (Android) — `TextBlock.boundingBox` returns `android.graphics.Rect` in pixels
- **react-native-executorch** (v0.6.0) — dependency to be removed from title extraction path (kept for other uses if any)

## Detailed Design

### Phase 1: Expose bounding boxes from native OCR

#### New data structure

```typescript
// lib/photo-processor/ocr-bridge/types.ts

interface OcrTextBlock {
  text: string;
  /** Bounding box in normalized coordinates (0-1), origin top-left */
  bounds: {
    x: number;      // left edge
    y: number;      // top edge
    width: number;
    height: number;
  };
}

interface OcrResult {
  success: boolean;
  text?: string;
  textBlocks?: Array<OcrTextBlock>;  // was: Array<string>
  confidence?: number;
  error?: string;
}
```

#### iOS changes (`ExpoTextExtractorModule.swift`)

Apple Vision returns `VNRecognizedTextObservation` with `.boundingBox` as a normalized `CGRect` with **bottom-left origin** (Core Graphics convention). The module must flip Y to top-left origin:

```swift
let results = observations.compactMap { observation -> [String: Any]? in
    guard let text = observation.topCandidates(1).first?.string else { return nil }
    let box = observation.boundingBox
    return [
        "text": text,
        "bounds": [
            "x": box.origin.x,
            "y": 1.0 - box.origin.y - box.height,  // flip Y to top-left origin
            "width": box.size.width,
            "height": box.size.height
        ]
    ]
}
promise.resolve(results)
```

#### Android changes (`ExpoTextExtractorModule.kt`)

ML Kit returns `TextBlock` with `.boundingBox` as `android.graphics.Rect` in pixel coordinates. Normalize to 0-1 using image dimensions:

```kotlin
val imageWidth = inputImage.width.toFloat()
val imageHeight = inputImage.height.toFloat()

val results = visionText.textBlocks.map { block ->
    val box = block.boundingBox
    mapOf(
        "text" to block.text,
        "bounds" to mapOf(
            "x" to (box?.left?.toFloat() ?: 0f) / imageWidth,
            "y" to (box?.top?.toFloat() ?: 0f) / imageHeight,
            "width" to ((box?.width()?.toFloat() ?: 0f) / imageWidth),
            "height" to ((box?.height()?.toFloat() ?: 0f) / imageHeight)
        )
    )
}
promise.resolve(results)
```

#### TypeScript interface update

```typescript
// expo-text-extractor module type
interface ExpoTextExtractorModule {
  isSupported: boolean;
  extractTextFromImage: (uri: string) => Promise<OcrTextBlock[]>;  // was string[]
}
```

#### Backward compatibility

The OCR bridge assembles `OcrResult` from the native response. The `text` field continues to be the concatenated text of all blocks (for downstream tag classification). The `textBlocks` field changes from `string[]` to `OcrTextBlock[]`.

Downstream consumers that only use `ocrResult.text` (tag classification) are unaffected. Title extraction switches to using the enriched `textBlocks`.

### Phase 2: Geometric title scoring

#### Scoring function

Each `OcrTextBlock` receives a score based on spatial features. All features are normalized to 0-1:

```
score(block) = w_height * relativeHeight(block)
             + w_position * verticalPosition(block)
             + w_width * widthRatio(block)
             + w_isolation * isolation(block)
             + w_brevity * brevity(block)
```

**Feature definitions:**

| Feature | Calculation | Rationale |
|---------|------------|-----------|
| `relativeHeight` | `block.bounds.height / max(all block heights)` | Largest text = likely title (font size proxy) |
| `verticalPosition` | `1 - block.bounds.y` | Top-of-page bias (y=0 is top, score=1) |
| `widthRatio` | `block.bounds.width / pageWidth` | Titles tend to span significant page width |
| `isolation` | `minGap(block, neighbors) / medianGap(all)` | Titles have more whitespace around them |
| `brevity` | `1 - min(lineCount(block) / 5, 1)` | Penalize dense multi-line paragraphs |

**Initial weights** (to be tuned against test corpus):

| Weight | Value | Notes |
|--------|-------|-------|
| `w_height` | 0.35 | Strongest signal — font size is the #1 visual cue |
| `w_position` | 0.20 | Useful but not dominant — some titles are mid-page |
| `w_width` | 0.10 | Mild signal — centered narrow titles exist |
| `w_isolation` | 0.20 | Strong signal — whitespace around titles is very common |
| `w_brevity` | 0.15 | Prevents body text paragraphs from scoring high |

#### Light text validation

After geometric scoring, the top candidate passes through a lightweight text filter to reject obvious non-titles:

- Starts with a bullet, number+period, or dash (likely list item)
- Contains recipe section keywords: "ingredients", "directions", "instructions", "method", "skladniki", "przygotowanie", "sposob"
- Contains measurement units: "cup", "tbsp", "ml", "g ", "oz", "lyzka", "szklanka"
- Is a single character or exceeds 200 characters

If the top candidate is rejected, try the second-highest scorer. If all top-3 are rejected, fall back to the heuristic extractor.

#### File organization

```
lib/text-classifier/
  title-extractor-geometric.ts    # NEW: geometric scoring function
  title-extractor.ts              # KEEP: heuristic fallback (web, edge cases)
  title-extractor-model.ts        # REMOVE: BERT token classification
  index.native.ts                 # MODIFY: use geometric extractor as primary
  index.web.ts                    # KEEP: unchanged (no bounding boxes on web)
```

### Phase 3: Integration into classification pipeline

#### Native path (`index.native.ts`)

The classification call chain changes:

```
classifyText(text, method, language)
  ├─ NEW primary: geometricTitleExtraction(ocrTextBlocks)
  │    → Returns title from geometric scoring + text validation
  │    → Falls back to heuristic extractor if all candidates rejected
  │
  ├─ REMOVED: TitleExtractorModel (BERT token classification)
  │
  └─ UNCHANGED: tag suggestions via EmbeddingsManager.classify(text)
```

The `OcrResult` with enriched `textBlocks` must be threaded through to the title extraction call site. Currently `classifyText` receives only the concatenated `text` string. The interface needs to accept optional `textBlocks: OcrTextBlock[]`:

```typescript
classifyText(
  text: string,
  method?: "embeddings" | "tfidf",
  language?: AppLanguage,
  textBlocks?: OcrTextBlock[]  // NEW: optional, for geometric extraction
): Promise<ClassificationResult>
```

When `textBlocks` with bounds are provided, geometric extraction is used. Otherwise, falls back to heuristic text extraction (web path, or when bounding boxes are unavailable).

#### Model cleanup

Remove or deprecate:
- `title-extractor-model.ts` — the BERT model manager
- Model download URLs for `fasola-title-extractor-pl` and `fasola-title-extractor-en`
- Stale-while-revalidate model update logic for title models
- Related ExecuTorch model loading code for title extraction

Keep:
- MiniLM/embeddings infrastructure (used for tag classification)
- `react-native-executorch` dependency if used by other features

### Web platform considerations

Tesseract.js can also return bounding box data (`block.bbox`, `line.bbox`, `word.bbox`), but the web OCR path uses a different worker architecture. For v1, the web path continues using the heuristic text extractor (`title-extractor.ts`). Bounding box support for Tesseract.js can be added in a follow-up if needed.

## Data Flow

```
Photo
  ↓
[Photo Processor Pipeline]
  Phase 1-3: geometry, lighting, clarity
  Phase 4: Text Recognition
    ↓
  [OCR Bridge - Native]
    expo-text-extractor.extractTextFromImage()
      → VNRecognizedTextObservation[] (iOS)
      → TextBlock[] (Android)
    ↓
  OcrResult {
    text: "concatenated text...",
    textBlocks: [
      { text: "SPAGHETTI CARBONARA", bounds: { x: 0.1, y: 0.05, width: 0.8, height: 0.08 } },
      { text: "Serves 4 | 30 minutes", bounds: { x: 0.2, y: 0.15, width: 0.6, height: 0.03 } },
      { text: "200g spaghetti...",    bounds: { x: 0.1, y: 0.25, width: 0.8, height: 0.02 } },
      ...
    ]
  }
    ↓
[Title Extraction - Geometric]
  Score each block:
    "SPAGHETTI CARBONARA"  → 0.92 (tall, top, wide, isolated, short)
    "Serves 4 | 30 min"   → 0.31 (small, near top, but tiny height)
    "200g spaghetti..."    → 0.15 (small, mid-page, paragraph)
  Validate top candidate: passes (not ingredient list, not section header)
  → title: "SPAGHETTI CARBONARA"
    ↓
[Tag Classification - Unchanged]
  EmbeddingsManager.classify("concatenated text...")
  → suggestions: [{ tag: "#italian", confidence: 0.82, category: "cuisine" }, ...]
    ↓
ClassificationResult {
  title: "SPAGHETTI CARBONARA",
  suggestions: [...],
  processingTimeMs: 45
}
```

## User Experience

No visible UX changes. The title field in the recipe editor continues to be pre-populated automatically. Users may notice:
- Faster title extraction (no BERT model load/inference)
- More accurate titles, especially for English recipes
- Smaller app download / less storage used (no BERT model downloads)
- Title extraction works immediately without waiting for model download

## Testing Strategy

### Unit tests

**Geometric scoring function** (`title-extractor-geometric.test.ts`):
- Given blocks with known bounds, verify the highest-scoring block matches expected title
- Test each feature in isolation: height-dominant block wins, top-position block wins, etc.
- Test text validation rejects ingredient blocks, section headers
- Test fallback: when all geometric candidates are rejected, heuristic extractor is called
- Test edge cases: single block (should return it), no blocks (should return undefined)

**OCR bridge changes:**
- Verify `OcrTextBlock` structure is correctly assembled from native response
- Verify Y-coordinate flipping for iOS (bottom-left → top-left origin)
- Verify normalization for Android (pixel coords → 0-1)

### Integration tests

**End-to-end title extraction:**
- Process a test image through the full pipeline and verify title is extracted
- Verify `classifyText` with `textBlocks` uses geometric path
- Verify `classifyText` without `textBlocks` falls back to heuristic path

### Evaluation against existing corpus

**Critical: benchmark against the same test set that produced 80%/41% baselines.**

The existing evaluation infrastructure (`tools/title-loop/eval_model.py`) evaluates BERT models against the test corpus (293 PL real files, 122 EN real files). A parallel evaluation script should:

1. For each test file with known expected title:
   - The test files contain OCR text but **not bounding boxes** (they're plain text)
   - For offline evaluation, we need a way to test geometric scoring
2. **Option A: Synthetic bounding boxes** — parse the OCR text files and assign synthetic bounding boxes based on heuristics (first line gets large bounds, subsequent lines get smaller bounds). This tests the scoring logic but not real OCR block segmentation.
3. **Option B: Re-scan evaluation images** — run the updated OCR pipeline on the original recipe images to get real bounding boxes, then evaluate. This is the ground-truth test but requires access to the source images.
4. **Option C: On-device evaluation** — run the app on test images and collect title extraction results. Most realistic but slowest.

Recommended: Start with Option A for rapid iteration on weights, validate with Option B/C before shipping.

### Weight tuning

The 5 scoring weights should be tuned against the real test corpus. Approach:
- Start with the initial weights defined above
- Run evaluation, identify failure patterns
- Adjust weights (grid search or manual tuning over the 5-dimensional space)
- Re-evaluate until accuracy plateaus

## Performance Considerations

**Improvements:**
- Eliminates BERT model download (132 MB PL, 54 MB EN over network)
- Eliminates BERT model load time (several seconds on first use)
- Eliminates BERT inference time (~100-500ms per prediction)
- Geometric scoring is O(n) where n = number of text blocks (typically 5-30), completes in <1ms
- No lazy model loading complexity or stale-while-revalidate updates

**Neutral:**
- Full-page OCR time unchanged (still runs Apple Vision / ML Kit on entire image)
- Tag classification unchanged (still uses MiniLM embeddings)

**Trade-offs:**
- Slightly larger OCR result payload (bounding box data per block) — negligible

## Security Considerations

No new security implications. The bounding box data is derived from on-device OCR processing of user-provided images. No data leaves the device. No new network calls.

## Documentation

- Update `docs/architecture.md` to reflect the new title extraction approach
- Update `lib/text-classifier/CLASSIFIER.md` with geometric scoring description
- Remove references to BERT title models from documentation
- Update spec 020 (PL model quantization) status if it becomes unnecessary for title extraction

## Implementation Phases

### Phase 1: Native module + scoring function

- Modify `expo-text-extractor` iOS and Android to return bounding boxes
- Update `OcrResult` type to include `OcrTextBlock` with bounds
- Update OCR bridge to pass through enriched data
- Implement `title-extractor-geometric.ts` with scoring function + text validation
- Unit tests for scoring function

### Phase 2: Pipeline integration + evaluation

- Wire geometric extractor into `index.native.ts` classification flow
- Thread `textBlocks` through from OCR result to `classifyText`
- Evaluate against existing test corpus (synthetic bounding boxes first)
- Tune scoring weights based on evaluation results
- Compare accuracy against BERT baseline (80% PL / 41% EN)

### Phase 3: Cleanup + validation

- Remove `title-extractor-model.ts` and BERT model infrastructure
- Remove model download URLs and stale-while-revalidate logic for title models
- On-device validation with real recipe images
- Update documentation

## Open Questions

1. **OCR block granularity**: Does Apple Vision return the title as a single `VNRecognizedTextObservation`, or does it fragment multi-word titles into separate observations? If fragmented, we may need to merge adjacent blocks at similar Y-positions before scoring. This needs empirical testing.

2. **Decorative fonts**: Some cookbooks use stylized/script fonts for titles. How well does Apple Vision OCR these? If OCR fails on the title block entirely (empty text), geometric scoring won't help. May need to fall back to recognizing the *second* most prominent block.

3. **Two-page spreads**: When a user photographs a two-page spread, there may be two recipes visible. The geometric scorer would pick the most visually prominent title. Is this acceptable, or should we detect multi-recipe pages?

4. **Existing test corpus compatibility**: The test corpus (`tools/title-loop/input/`) contains plain text files without bounding boxes. How do we create a bounding-box-annotated test set for evaluation? Re-scanning original images is ideal but may not be available for all test cases.

5. **expo-text-extractor ownership**: The module is at v0.2.2. Is this an internal module we control, or a third-party dependency? If third-party, we need to fork or contribute the bounding box changes upstream.

6. **Weight tuning methodology**: Should we use a simple grid search over the 5 weights, or invest in a more principled approach (e.g., logistic regression on geometric features with title/non-title labels)?

## References

- [Spec 005: Text Recognition](../005_text_recognition/spec.md) — original OCR pipeline design
- [Spec 019: Title Extraction Loop](../019_title_extraction_loop/feat-title-extraction-self-improving-loop.md) — self-improving heuristic loop
- [Spec 020: PL Model Quantization](../020_pl_model_quantization/feat-pl-model-int8-quantization.md) — INT8 quantization (may become unnecessary for title models)
- Apple Vision `VNRecognizedTextObservation` — [developer.apple.com/documentation/vision/vnrecognizedtextobservation](https://developer.apple.com/documentation/vision/vnrecognizedtextobservation)
- ML Kit Text Recognition `TextBlock` — [developers.google.com/ml-kit/vision/text-recognition](https://developers.google.com/ml-kit/vision/text-recognition)
- Current evaluation results: PL 80.2% real (235/293), EN 41.0% real (50/122)

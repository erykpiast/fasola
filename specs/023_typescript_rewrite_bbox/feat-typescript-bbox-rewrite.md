# TypeScript Rewrite of Geometric Title Extraction with Parity Loop

**Status:** Draft
**Authors:** Claude, 2026-03-29

## Overview

Rewrite the Python geometric title extraction algorithm (`tools/title-loop/analyze_bboxes.py`) to TypeScript for integration into the Fasola app. Build an autonomous comparison loop that runs both implementations side-by-side on the same input data, detects output divergences, and iteratively fixes them using Claude Code headless until the TypeScript version produces identical results to Python on all 407 test images.

## Background / Problem Statement

Spec 022 produced a mature geometric title extraction algorithm in Python (`analyze_bboxes.py`, ~1326 lines) that uses region clustering and scoring to identify recipe titles from OCR bounding box data. This algorithm achieves the project's accuracy targets on the 407-image real test corpus.

However, the Python implementation cannot ship in the Expo/React Native app. It must be rewritten to TypeScript to replace the current title extraction stack (BERT token classifier at 554 MB + MiniLM embeddings at 80 MB) with a zero-model-weight approach.

The rewrite is non-trivial because:

1. **Algorithm complexity** — 1326 lines of Python with 6 interconnected heuristics, region clustering, multi-stage scoring, text validation, and multi-recipe detection
2. **Subtle numeric behavior** — floating-point scoring thresholds, gap calculations, and merge decisions that could drift during translation
3. **OCR normalization** — Unicode handling, diacritics stripping, fuzzy matching with Levenshtein distance that must be character-perfect
4. **No unit tests exist** — the Python code is validated only by end-to-end accuracy on the test corpus, so any divergence must be caught at the integration level

### Why an autonomous comparison loop

Manual rewrite-then-test cycles are too slow for 1326 lines of algorithmic code. An autonomous loop that:
- Runs Python and TypeScript on identical inputs
- Diffs outputs structurally (not just final title, but intermediate scoring)
- Feeds divergences to Claude Code for targeted fixes
- Commits after each fix and re-evaluates

...can converge on parity much faster than manual iteration.

## Goals

- Produce a TypeScript module at `lib/text-classifier/title-extractor-bbox.ts` that is a faithful port of `analyze_bboxes.py` heuristic 5 (region clustering)
- Include the `titles_match` evaluation function and all normalization helpers
- Achieve **100% output parity** with Python on all 407 bbox JSON files
- Build a comparison harness (`tools/title-loop/compare-implementations.py`) that automates parity testing
- Build a self-improving loop (`tools/title-loop/bbox-parity-loop.py`) that drives Claude Code headless to fix divergences
- Integrate the TypeScript module with the app's text classification pipeline

## Non-Goals

- Porting the neural network pipeline (BERT training/inference) — that's being replaced entirely
- Porting `recognize_bboxes.py` — OCR with bounding boxes already exists in the native `text-extractor` module
- Porting heuristics 1-4 from `analyze_bboxes.py` — only heuristic 5 (region clustering) ships
- Improving the algorithm during the rewrite — parity first, enhancements later
- Web platform support — bbox extraction is native-only (web continues using heuristic text extraction)

## Technical Dependencies

- **TypeScript 5.9** — project's current version
- **Node.js / tsx** — for running the TypeScript implementation in the comparison harness
- **Python 3.x** — for running the reference implementation
- **Claude Code CLI** — headless mode for the autonomous loop (`claude --headless`)
- No new npm packages required — the algorithm is pure computation (no ML, no I/O)

## Detailed Design

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Comparison Loop                          │
│                                                             │
│  bbox JSON ──┬──▶ Python analyze_bboxes.py ──▶ result.json │
│  (407 files) │                                              │
│              └──▶ TS title-extractor-bbox.ts ──▶ result.json│
│                                                             │
│  diff results ──▶ failure report ──▶ Claude Code ──▶ fix   │
│                                     (headless)     commit  │
│                                                             │
│  repeat until 0 divergences                                 │
└─────────────────────────────────────────────────────────────┘
```

### 1. TypeScript Module Structure

**File:** `lib/text-classifier/title-extractor-bbox.ts`

```typescript
// ── Types ──────────────────────────────────────────────────

interface BboxObservation {
  text: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
}

interface BboxInput {
  image: string;
  observations: Array<BboxObservation>;
}

interface Region {
  observations: Array<BboxObservation>;
  y: number;
  x: number;
  width: number;
  height: number;
  lineCount: number;
  text: string;
}

interface ScoredRegion extends Region {
  score: number;
  components: Record<string, number>;
}

// ── Public API ─────────────────────────────────────────────

export function extractTitleFromBboxes(
  input: BboxInput
): string | undefined;
```

**Key functions to port (mapping Python → TypeScript):**

| Python function | TypeScript function | Purpose |
|----------------|-------------------|---------|
| **Heuristic 5 — core pipeline** | | |
| `heuristic_region_clustering()` | `extractTitleFromBboxes()` | Main entry: cluster → score → merge → validate |
| `detect_columns()` | `detectColumns()` | Test X-axis split positions for two-column layouts |
| `cluster_into_regions()` | `clusterIntoRegions()` | Orchestrate column detection → per-column clustering → merge |
| `_cluster_column()` | `clusterColumn()` | Per-column clustering: bands → sub-split by height → merge bands |
| `find_same_y_groups()` | `findSameYGroups()` | Group observations on the same horizontal band |
| `_merge_stacked_title_lines()` | `mergeStackedTitleLines()` | Post-merge: combine multi-line title blocks by left-edge alignment |
| `score_title_region()` | `scoreTitleRegion()` | 6-feature weighted scoring + gutter penalty |
| `validate_title_text()` | `validateTitleText()` | Reject ingredients, metadata, section labels |
| `_strip_trailing_ingredients()` | `stripTrailingIngredients()` | Extract text before first measurement pattern |
| `_extract_leading_title()` | `extractLeadingTitle()` | Extract title from leading observation(s) of oversized regions |
| **Evaluation helpers** | | |
| `normalize()` | `normalize()` | Whitespace collapsing + uppercase |
| `strip_diacritics()` | `stripDiacritics()` | Remove Polish ł/Ł and Unicode diacritics |
| `ocr_normalize()` | `ocrNormalize()` | OCR digit-letter confusion (0→O, 1→I, 5→S) |
| `norm_for_match()` | `normForMatch()` | Full normalization pipeline for matching |
| `_levenshtein()` | `levenshtein()` | Edit distance calculation |
| `titles_match()` | `titlesMatch()` | Multi-fallback fuzzy title comparison (6 levels) |

**Python-specific constructs requiring careful translation:**

| Python construct | TypeScript equivalent | Risk |
|-----------------|----------------------|------|
| `defaultdict(list)` | `Map` with lazy `get-or-create` | Low |
| `statistics.mean()` / `statistics.median()` | Manual implementations (no stdlib) | Low |
| `id(r)` for object identity in `set()` | Index-based or WeakSet deduplication | Medium |
| `re.sub()` / `re.search()` | `String.replace()` / `RegExp.test()` | Low |
| `unicodedata.normalize("NFD", s)` | `String.prototype.normalize("NFD")` | Direct mapping |
| `sorted(key=lambda)` with stable sort | `Array.sort()` — stable in V8/Hermes, but use index tiebreaker for safety | Medium |
| Tuple unpacking (`a, b = x, y`) | Destructuring or explicit assignment | Low |
| `None` returns | `undefined` (not `null`) per project convention | Low |

### 2. Comparison Harness

**File:** `tools/title-loop/compare-implementations.py`

Runs both implementations on all bbox JSON files and compares extracted titles.

```python
# Pseudocode
for bbox_file in glob("bboxes/*.json"):
    if bbox_file.name.startswith("_"):
        continue

    # Run Python
    py_title = run_analyze_bboxes(bbox_file)  # heuristic_region_clustering()

    # Run TypeScript via subprocess
    ts_title = run_ts_extract(bbox_file)  # tsx tools/title-loop/extract-bbox.ts

    # Compare: title-string match only (not scores)
    if py_title != ts_title:
        failures.append({
            "image": bbox_file.stem,
            "python_title": py_title,
            "ts_title": ts_title,
        })
```

**Comparison is title-string only.** Floating-point score differences between Python and TypeScript are irrelevant as long as the same title wins. This avoids epsilon debates and keeps the comparison simple. If the loop stalls because Claude can't diagnose a divergence from titles alone, intermediate state output can be added as a debugging aid at that point.

**TypeScript CLI wrapper:** `tools/title-loop/extract-bbox.ts`

A thin CLI that loads a bbox JSON file, calls `extractTitleFromBboxes()`, and prints the extracted title to stdout.

### 3. Autonomous Parity Loop

**File:** `tools/title-loop/bbox-parity-loop.py`

Modeled on the existing `bbox-loop.py` pattern, reusing its proven stall detection, retry logic, and streaming infrastructure:

```
for iteration in range(MAX_ITERATIONS):
    1. Run compare-implementations.py → failures.json
    2. If 0 failures → DONE, exit
    3. Compile-check: run `npx tsc --noEmit lib/text-classifier/title-extractor-bbox.ts`
       - If compile fails, feed errors to Claude as the prompt (skip comparison)
    4. Pick top-N failures (grouped by divergence pattern)
    5. Generate prompt with:
       - The failure examples (Python title vs TS title)
       - Instructions: "Read both source files, find the divergence, fix the TypeScript"
    6. Launch Claude Code headless with the prompt
       - Stall detection: kill if no output for 180s (CLAUDE_STALL_TIMEOUT)
       - Hard timeout: 1800s per session
       - Retry: up to 3 attempts on stall/failure (CLAUDE_MAX_RETRIES)
    7. Regression check: re-run comparison, verify failure count decreased
       - If regression detected, log warning and revert commit
    8. Commit changes
    9. Log iteration: failures remaining, patterns fixed
```

**Key design decisions:**

- **Title-string comparison** — compare extracted title strings only, not intermediate scores. Simpler, avoids float-precision noise, sufficient for parity
- **Compile-before-compare** — a TypeScript compile check after each Claude edit prevents wasting an iteration on syntax errors
- **Regression detection** — if a fix increases total failures, the commit is reverted. This prevents oscillation where fixing one image breaks another
- **Stall/retry from bbox-loop.py** — reuse the `ClaudeStallError` detection (monitor stdout for inactivity), retry logic, and stream-json parsing that are already battle-tested
- **Iteration budget** — 20 iterations max, 30 minutes per Claude session, same as bbox-loop.py

### 4. App Integration

Once parity is achieved, the TypeScript module integrates into the existing pipeline:

**In `lib/text-classifier/index.native.ts`:**

```typescript
import { extractTitleFromBboxes } from "./title-extractor-bbox";

// When bounding box data is available (native OCR), prefer geometric extraction
if (ocrResult.boundingBoxes) {
  const title = extractTitleFromBboxes({
    image: photoUri,
    observations: ocrResult.boundingBoxes,
  });
  if (title) {
    return { title, suggestions, processingTimeMs };
  }
}

// Fallback to existing heuristic + embeddings approach
```

This requires threading bounding box data through the OCR bridge layer. The native `text-extractor` module already has `TextObservation` and `BoundingBox` types and an `extractTextWithBounds()` function, but the OCR bridge currently discards this data. Required changes:

1. **Extend `OcrResult` type** (`lib/photo-processor/ocr-bridge/types.ts`): add `observations?: Array<TextObservation>` field (import from `text-extractor`)
2. **Change native OCR bridge** (`lib/photo-processor/ocr-bridge/index.native.ts`): call `extractTextWithBounds()` instead of `extractTextFromImage()`, populate the new `observations` field
3. **Thread through pipeline**: `TextRecognitionResult` inherits bbox data via `OcrResult` — no additional changes needed
4. **Web platform**: no change — `observations` stays `undefined`, falls back to existing heuristic+embeddings title extraction

## User Experience

No user-facing changes. Title extraction happens during background photo processing. Users see extracted titles appear on recipe cards after import. The only observable difference is:
- Faster title extraction (no model loading)
- Smaller app binary (~634 MB saved from removing BERT + MiniLM for title extraction)
- Potentially different title extraction results on edge cases (addressed by parity testing)

## Testing Strategy

### Parity Testing (primary)

The comparison loop IS the test suite. It validates that TypeScript produces identical output to Python on all 407 real images. This is more thorough than unit tests because it covers the full algorithm on real data.

**Why parity testing is the right approach here:**
- The Python implementation is the specification — it defines correct behavior
- 407 real images cover edge cases that unit tests would miss
- Intermediate state comparison catches bugs that would be invisible at the title level

### Unit Tests

After parity is achieved, extract key functions into testable units:

**File:** `lib/text-classifier/__tests__/title-extractor-bbox.test.ts`

```typescript
// Purpose: Verify normalization handles Polish diacritics and OCR artifacts
describe("normForMatch", () => {
  it("strips Polish diacritics", () => { ... });
  it("normalizes OCR digit-letter confusion", () => { ... });
  it("handles pipe-as-I substitution", () => { ... });
});

// Purpose: Verify region clustering produces correct groupings
describe("clusterObservations", () => {
  it("groups observations on the same horizontal band", () => { ... });
  it("splits bands with different line heights", () => { ... });
});

// Purpose: Verify title text validation rejects non-title content
describe("validateTitleText", () => {
  it("rejects ingredient measurements", () => { ... });
  it("rejects section labels in Polish", () => { ... });
  it("accepts valid recipe titles", () => { ... });
});

// Purpose: Verify fuzzy matching handles OCR errors
describe("titlesMatch", () => {
  it("matches despite diacritic differences", () => { ... });
  it("matches merged words", () => { ... });
  it("matches with suffix/prefix cropping", () => { ... });
});
```

### Integration Test

A single integration test that runs `extractTitleFromBboxes()` on a representative bbox JSON and asserts the expected title:

```typescript
// Purpose: Smoke test that the full pipeline works end-to-end
it("extracts title from a real bbox file", () => {
  const input = loadBboxJson("IMG_1358.json");
  const title = extractTitleFromBboxes(input);
  expect(title).toBe("ŻUREK");
});
```

## Performance Considerations

- **No model loading** — pure computation, ~0ms startup vs ~2s for BERT model loading
- **O(n^2) region merging** — with 54 observations/image average, this is ~2900 comparisons, negligible
- **Single-pass scoring** — each region scored once, no iterative optimization
- **Expected runtime** — <10ms per image on modern devices (vs ~200ms for BERT inference)

## Security Considerations

- No network calls — algorithm operates on local OCR data only
- No user input parsing — input is structured JSON from trusted native OCR module
- No file system access — pure function from data to string

## Documentation

- Update `docs/architecture.md` to reflect the new title extraction approach
- Update spec 022 status to "Implemented"
- Add inline documentation to the TypeScript module explaining the scoring weights and merge thresholds (these are the most likely source of future bugs)

## Implementation Phases

### Phase 1: TypeScript Port + Comparison Harness

1. Create `lib/text-classifier/title-extractor-bbox.ts` — direct port of all heuristic 5 functions (see function mapping table above)
2. Create `tools/title-loop/extract-bbox.ts` — CLI wrapper that loads bbox JSON, calls `extractTitleFromBboxes()`, prints title to stdout
3. Create `tools/title-loop/compare-implementations.py` — runs both implementations on all 407 bbox files, outputs title-string divergences as `failures.json`

### Phase 2: Autonomous Parity Loop

4. Create `tools/title-loop/bbox-parity-loop.py` — orchestrates Claude Code headless with compile-check, stall detection, regression guard (reuse patterns from `bbox-loop.py`)
5. Run the loop until 0 divergences on all 407 images
6. Commit the final parity-verified TypeScript module

### Phase 3: App Integration

7. Extend `OcrResult` type with `observations?: Array<TextObservation>` field
8. Change `lib/photo-processor/ocr-bridge/index.native.ts` to call `extractTextWithBounds()` and populate `observations`
9. Wire `extractTitleFromBboxes()` into `lib/text-classifier/index.native.ts` (with existing heuristic+embeddings as fallback)
10. Add unit tests for key functions (`normForMatch`, `clusterObservations`, `validateTitleText`, `titlesMatch`)
11. Remove BERT model loading code and model download URLs (once confidence is high)

## Resolved Questions

1. **Should the comparison loop also test on the 4810 generated input files?** No — generated files have text but no bounding boxes. They're for the text-based extraction path, not bbox.

2. **Should we port `titles_match()` to TypeScript?** Yes — it's included in the function mapping table. Needed for evaluation and useful long-term.

3. **How to handle floating-point precision differences?** Compare title strings only, not scores. If both implementations extract the same title, the scores are irrelevant. This eliminates float-precision concerns entirely.

4. **What's the fallback strategy during the transition?** Keep existing heuristic + embeddings as fallback when `observations` is `undefined` (web platform, or native OCR failure).

## Open Questions

1. **Should the Python algorithm be frozen during the TS rewrite?** The `bbox-loop.py` improvement loop may still be running on this branch. Concurrent Python changes would invalidate parity. Recommendation: freeze `analyze_bboxes.py` at a known-good commit before starting Phase 1.

2. **Hermes engine compatibility** — The TypeScript port will be tested via `tsx` (Node.js) but runs in Hermes (React Native) in production. Need one end-to-end test on a real device after parity is achieved to confirm no engine-specific behavior differences (e.g., regex edge cases, sort stability).

## References

- Spec 021: `specs/021_geometric_title_extraction/feat-geometric-title-extraction.md` — initial geometric approach
- Spec 022: `specs/022_layout_title_extraction/feat-layout-based-title-extraction.md` — region clustering approach (Python reference implementation)
- Python reference: `tools/title-loop/analyze_bboxes.py` — 1326-line algorithm to port
- Existing loop: `tools/title-loop/bbox-loop.py` — self-improving loop pattern to reuse
- Existing TS title extraction: `lib/text-classifier/title-extractor.ts` — current heuristic approach
- Bbox test data: `tools/title-loop/bboxes/*.json` — 407 real image bbox files

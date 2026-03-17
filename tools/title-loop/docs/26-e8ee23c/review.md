# Code Review — Iteration 26 (e8ee23c)

## Review Scope
Target: `lib/text-classifier/title-extractor.ts`, `lib/text-classifier/food-dictionary.ts`
Improvement plan: `tools/title-loop/docs/26-e8ee23c/improvement-plan.md`
Context: Mobile device (React Native/Expo), 10-second budget for title extraction

## Executive Summary

All 5 planned fixes were implemented correctly. The code adds no embedding calls — all
changes are string heuristics with negligible latency impact (<5ms total). Two code
quality issues were fixed during review (readability of operator grouping in the
caps-coalescing condition, and an improved comment for the pre-threshold corroboration
guard). Real-file accuracy remains 100% (11/11). Test suite passes (36/36).

The main structural risk is that `CATEGORY_SECTION_LABELS` is manually maintained
alongside `SECTION_LABELS` with no enforcement that it stays a subset. The main
testing gap is that 6 of 8 new features lack dedicated test coverage.

## Fixes Applied During Review

### 1. Added explicit parentheses in caps-coalescing merge condition
**File**: `title-extractor.ts:585`

The `||` expression grouping relied on implicit `&&` > `||` precedence. While the
behavior was correct, the intent was non-obvious in a multi-line `if` condition with
6 `&&`-joined terms. Added inner parentheses to make the grouping explicit:

```typescript
// Before (correct but unclear):
(!isSectionLabel(next.text) && !isSectionLabel(repairOcrText(next.text)) ||
 (wordCount(next.text) === 1 && ...))

// After (explicit grouping):
((!isSectionLabel(next.text) && !isSectionLabel(repairOcrText(next.text))) ||
 (wordCount(next.text) === 1 && ...))
```

### 2. Improved comment on `remainingCaps.length >= 2` guard
**File**: `title-extractor.ts:1200-1206`

Added a NOTE comment explaining why the `>= 2` guard is conservative and why relaxing
to `>= 1` causes regressions (3-line join candidates spanning section labels pass
corroboration via shared vocabulary, displacing legitimate short titles).

---

## Plan Coverage

| Plan Fix | Pattern | Implemented | Location |
|----------|---------|-------------|----------|
| Fix 1: Expand food dictionary | B, C | Yes | `food-dictionary.ts:133-145` (~30 words) |
| Fix 2: Relax section-label merge | E | Yes | `title-extractor.ts:585-587` (uses `isCategorySectionLabel`) |
| Fix 3: Improve spillover handling | A | Yes | `title-extractor.ts:436-471` (3 termination conditions) |
| Fix 4: Strengthen preamble bonus | D | Yes | `title-extractor.ts:1017-1055` (+0.12/+0.08 split, +0.15 cap) |
| Fix 5a: Unicode fractions | F | Yes | `title-extractor.ts:101-104` |
| Fix 5b: Body-prose detection | F | Yes | `title-extractor.ts:355-381` |

Beyond-plan additions:
- `passesCorroboration` + `extractContentWords` for pre-threshold artifact filtering (lines 1200-1219)
- Corroboration in multi-title assembly (lines 1394-1405)

The plan's "No changes to multi-title assembly logic" was not fully honored — both
additions alter multi-title behavior. The changes are correct and well-guarded.

---

## Quality Metrics

| Aspect | Score | Notes |
|---|---|---|
| Architecture | 7/10 | Clean pipeline; `CATEGORY_SECTION_LABELS` drift risk |
| Code Quality | 8/10 | Readable, well-commented; minor duplication |
| Performance | 9/10 | All string heuristics, no embedding calls, <5ms added |
| Testing | 5/10 | 6 of 8 new features lack dedicated tests |

---

## Issues by Priority

### HIGH: `CATEGORY_SECTION_LABELS` can drift from `SECTION_LABELS`
**File**: `title-extractor.ts:173-183`

Three overlapping sets govern section labels (`SECTION_LABELS`, `CATEGORY_SECTION_LABELS`,
`ALWAYS_BLOCK_JOIN_LABELS`) with no code enforcing that `CATEGORY_SECTION_LABELS` is a
subset of `SECTION_LABELS`. A future edit could add a category label to one set but not
the other, silently breaking the merge-relaxation path.

Multi-word entries like `"main courses"`, `"fish & seafood"`, `"side dishes"` are in
`SECTION_LABELS` but absent from `CATEGORY_SECTION_LABELS`. This is currently harmless
(the `wordCount === 1` guard prevents multi-word labels from triggering the relaxation),
but a future caller of `isCategorySectionLabel` without that guard would get wrong answers.

**Recommendation**: Derive `CATEGORY_SECTION_LABELS` from `SECTION_LABELS` by exclusion
(everything not in `ALWAYS_BLOCK_JOIN_LABELS`), or add a dev-time assertion.

### HIGH: 6 of 8 new features lack test coverage
**File**: `__tests__/title-extractor.test.ts`

The improvement plan specified 5 unit test cases and 4 edge cases. None were added.
Features lacking dedicated coverage:

1. `startsWithNumber` with Unicode fractions
2. `CATEGORY_SECTION_LABELS` merge relaxation (e.g., `LEMON HERB ROASTED` + `VEGETABLES`)
3. Pre-threshold artifact filtering
4. `isBodyProse` / `isTitleAbsentPage` body-prose detection
5. `findBurstEnd` spillover with consecutive-blank/ALL_CAPS termination
6. First-after-preamble bonus strengthening (+0.08/+0.12 split, +0.15 cap)

The existing corroboration tests (lines 380-469) cover multi-title post-selection
corroboration but do NOT reach the pre-threshold path (different input arrays, different
triggering conditions).

### MEDIUM: `remainingCaps.length >= 2` guard is too conservative
**File**: `title-extractor.ts:1215`

When a page has exactly 2 ALL_CAPS candidates and one is a corroboration-failing artifact,
the safety check prevents removal. The artifact stays in `scoredForThreshold`, potentially
inflating the threshold. Relaxing to `>= 1` causes a regression (see "WORD ONE /
INGREDIENTS / WORD TWO" test) because 3-line join candidates spanning section labels
can pass corroboration via shared vocabulary. A proper fix requires either:

- Excluding multi-line join candidates from the corroboration check, or
- Adding a hard filter rejecting candidates that contain embedded section labels

### MEDIUM: `isCategorySectionLabel` duplicates normalization from `isSectionLabel`
**File**: `title-extractor.ts:185-197`

Both functions contain identical normalization: `stripDiacritics(text.trim().replace(/[:.]$/, "").toLowerCase())`.
No shared helper. `isSectionLabel` also applies an OCR variant check (`l` → `i`) that
`isCategorySectionLabel` omits — intentionally, but undocumented.

### LOW: `extractContentWords` drops words < 3 alpha chars without explanation
**File**: `title-extractor.ts:231-236`

The `>= 3` threshold means Polish prepositions like `"z"` (1 char) are excluded from
corroboration. This is correct (they're not distinctive) but the rationale should be
documented since `passesCorroboration` thresholds depend on it.

### LOW: `findBurstEnd` inner loop has no depth cap
**File**: `title-extractor.ts:444-470`

The outer loop caps at `k < 30`, but the inner `while m < lines.length` loop scans to
the end of the document. For unusually long OCR pages (300+ lines), this could scan
further than needed. No infinite-loop risk (m strictly increments). A defensive cap
like `m < Math.min(lines.length, k + 80)` would limit worst-case scanning.

---

## Strengths to Preserve

- `findBurstEnd` overflow-skip logic with 3 clean termination conditions and the
  "don't skip past the heading itself" guard at line 462
- `isBodyProse` is tight and well-scoped with clear JSDoc
- Positional boost cap at +0.15 prevents over-boosting when multiple bonuses fire
- Dictionary additions are confined to a clearly labeled section with inline rationale
- The `CATEGORY_SECTION_LABELS` / structural-label distinction correctly separates
  "food-group descriptor that can appear in titles" from "structural separator that never should"

---

## Performance Assessment

All changes are string matching and heuristic checks — no additional embedding calls.

| Change | Complexity | Estimated cost |
|--------|-----------|----------------|
| `passesCorroboration` (2 passes) | O(candidates × words × lines) | ~0.1ms |
| `isBodyProse` in `isTitleAbsentPage` | O(3) per page | <0.01ms |
| `isCategorySectionLabel` in merge loop | O(candidates) | <0.01ms |
| `findBurstEnd` improved skip | O(lines) per overflow marker | <0.01ms |
| Dictionary expansion (+30 words) | O(1) Set lookup | unmeasurable |

Total added latency: <1ms. No impact on 10-second budget.

---

## Verification Results

- **Tests**: 36/36 pass (0 regressions)
- **Real files**: 11/11 correct
- **CLI**: All real input files produce expected titles

# Iteration 24 Code Review

## Files Reviewed

- `lib/text-classifier/title-extractor.ts` — all uncommitted changes
- `lib/text-classifier/food-dictionary.ts` — new file

## Summary of Changes

The iteration implements 7 improvement categories from the improvement plan:

1. **Dictionary-guided OCR repair** (`repairOcrWord`, `repairOcrText`, `generateSubstitutions`) — new functions that resolve ambiguous OCR digit→letter substitutions using a food-word dictionary. Applied before candidate scoring in `buildCandidates` and again in `normalizeOcrTitle`.

2. **Food dictionary** (`food-dictionary.ts`) — ~500 English and Polish food/cooking words stored as a `Set<string>` without diacritics.

3. **Candidate-relative position bonus** — position factor now uses `candidateIndex / rawScored.length` instead of `rs.position / lines.length`, so filtered preamble lines don't penalize the first surviving candidate.

4. **First-after-preamble bonus** (+0.08) — when all lines before the first candidate are empty or fail hard filters, that candidate gets an explicit structural-title-position boost.

5. **Title-absent page detection** (`isTitleAbsentPage`) — returns empty when the first 3 non-empty lines are all ingredients/instructions, with rawScore and position guards.

6. **Compound title dedup protection** — titles containing ` + `, ` : `, or ` & ` are protected from the shorter-substring dedup filter.

7. **Expanded garbled-text detection** — pipe-in-word and mixed Cyrillic/Latin checks in `isLikelyGarbled`.

8. **Expanded cooking verbs** — `COOKING_INSTRUCTION_STARTS` grew from ~32 to ~80 verbs.

9. **Bilingual layout boost** — detects [FoodName]\n[Translation]\n...[Section label] pattern and boosts position-0 candidate.

10. **New hard filters** — `MAIN RECIPE:` prefix and `--` sub-section headers added to `METADATA_PATTERNS`.

## Correctness vs. Improvement Plan

All 11 changes listed in the plan's summary table are implemented. The code matches the plan's intent.

**Critical constraint verified**: The substring deduplication block ("keep the shorter") is untouched. The compound-title guard is a short-circuit `return true` inserted *before* the existing logic — it prevents compound titles from entering the dedup, but does not alter the dedup logic itself.

## Issues Found and Fixed

### 1. Array notation (AGENTS.md violation) — Fixed

Several new declarations used `T[]` instead of `Array<T>`:
- `positions: { index: number; replacements: string[] }[]`
- `generateSubstitutions` return type and parameter
- `isTitleAbsentPage(lines: string[])`

All converted to `Array<T>` notation.

### 2. Redundant `--` pattern in `passesHardFilters` — Fixed

The pattern `/^--\s*\w/` was added to both `METADATA_PATTERNS` (checked via `looksLikeMetadata()`) and directly in `passesHardFilters`. Since `passesHardFilters` already calls `looksLikeMetadata()`, the direct check was redundant. Removed the duplicate from `passesHardFilters`.

## Minor Observations (Not Fixed — Low Priority)

- **`OCR_ARTIFACT_PATTERN`** matches all digits 0-9 but `OCR_SUBSTITUTIONS` only has entries for 0, 1, 4, 5. Words containing only digits 2, 3, 6-9 will trigger `repairOcrWord` but exit via the `positions.length === 0` early return. Not a bug — just a micro-inefficiency for rare cases.

- **Double OCR repair**: `repairOcrText` runs in `buildCandidates` (pre-scoring) and again in `normalizeOcrTitle` (post-selection). The second pass is a no-op for already-repaired words (the artifact pattern won't match), so it's safe but slightly wasteful.

## Pre-existing Issues (Not Regressions)

CLI results show 2 cases that don't match expectations — verified against the committed (pre-change) version:

- **Faszerowana papryka**: extracts "Faszerowana papryka PAPRIKA GYERAN-JJIM 파프리카 계란찜" (appends Korean transliteration) — pre-existing
- **FINNISH MILK FLATBREADS**: extracts "DAT FLATBREADS + FINNISH MILK FLATBREADS" (truncated prefix) — pre-existing

## Test Results

- **Unit tests**: 33/33 passed
- **CLI smoke test**: all 11 real input files processed, outputs consistent with pre-change baseline

## Architecture Assessment

The changes are well-structured:
- New OCR repair functions are pure, stateless, and isolated — easy to test independently
- The food dictionary is a separate module with a clear boundary
- Each improvement plan item maps to a discrete, localized code change
- No global behavioral changes that could cause unexpected regressions in unrelated cases

## Performance Assessment

- Dictionary lookup uses a `Set` (O(1) per lookup)
- `generateSubstitutions` is bounded at 8 positions × 2 replacements max = 256 variants worst case; typical recipe words have 0-2 OCR artifacts = 1-4 variants
- `repairOcrText` adds one pass per candidate (~20-40 candidates typical) with short-circuit on words without artifacts
- `isTitleAbsentPage` scans first 3 non-empty lines — negligible cost
- Overall: well within the 10-second mobile constraint. The embedding model call remains the dominant cost.

## Overall Assessment

Solid implementation that closely follows the improvement plan. Code is clean, changes are localized, and no regressions were introduced. Two minor style/redundancy issues were fixed during review.

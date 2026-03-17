# Code Review: Iteration 29 (title-extractor.ts)

**Date:** 2026-03-17
**Scope:** Uncommitted changes implementing improvement plan Changes A-F
**Reviewed against:** `tools/title-loop/docs/29-e7e3098/improvement-plan.md`

---

## Executive Summary

The six changes (A-F) are correctly implemented and aligned with the improvement plan. Four issues were found and fixed during review: a divergence between OCR repair paths, an over-eager erratic casing threshold, a wasteful computation ordering, and a redundant function call. All 37 unit tests pass and all 11 real files extract correctly after fixes.

## Quality Metrics

| Aspect          | Score | Notes                              |
|-----------------|-------|------------------------------------|
| Architecture    | 8/10  | Sound pipeline; OCR repair paths starting to diverge (addressed) |
| Code Quality    | 8/10  | Clean after fixes; minor redundancy remains in normalizeErraticCasing |
| Performance     | 9/10  | All changes O(1) per candidate; total regex overhead < 30ms on Hermes |
| Testing         | 7/10  | 37 tests pass; no new unit tests for Changes A-F yet (see plan) |
| Plan Alignment  | 9/10  | One justified deviation (Change B length cap), one simplification (Change D) |

---

## Issues Found and Fixed

### 1. `applyBlindOcrRepairToken` ALL_CAPS branch missing repairs (HIGH)

**File:** `title-extractor.ts:879-890`

The token-level ALL_CAPS branch was missing `!->I`, `euro->E`, and `[ii]->I` repairs that exist in the full-string `applyBlindOcrRepair` ALL_CAPS branch. A mixed-case line with an individual ALL_CAPS token (e.g., `"Soup IZ READY"` with accented I) would silently skip these repairs.

**Fix:** Added `.replace(/!/g, "I").replace(/euro/g, "E").replace(/[II]/g, "I")` to the token ALL_CAPS path, with a sync comment.

### 2. `hasErraticCasing` fires on short tokens (HIGH)

**File:** `title-extractor.ts:931`

The minimum word length was 3, but the threshold `upperInner >= 2 && upperInner >= lowerInner * 0.3` is unreliable on 3-4 character words. A token like `"ZALe"` (inner `"ALe"`, upperInner=2, lowerInner=1) would falsely trigger normalization, silently mutating candidate text.

**Fix:** Raised minimum word length from 3 to 5.

### 3. `passesHardFilters` computed OCR normalization too early (MEDIUM)

**File:** `title-extractor.ts:407-415`

`ocrNormForInstruction` was computed before the raw `looksLikeCookingInstruction(text)` check. Moved it after — the string is only needed when the raw check passes.

### 4. Redundant `hasErraticCasing` call in `buildCandidates` (MEDIUM)

**File:** `title-extractor.ts:695-697`

`hasErraticCasing` was called on `line.text` in the guard condition and again on `repairable` (which has identical casing since `repairOcrText` only replaces digits). Cached the guard result to avoid the redundant call.

---

## Plan Alignment

| Change | Status | Deviation |
|--------|--------|-----------|
| A: Mixed-case OCR repair (0->o, 4->a, 5->s) | Correct | None |
| B: Garbled multi-word detection | Correct | Added `length <= 7` cap (justified: prevents false positives on OCR dropped-space artifacts like "withGarlic") |
| C: Polish cooking verbs | Correct | All plan verbs present with diacritic-tolerant forms |
| D: OCR-normalized instruction check | Simplified | Lowercase-only guard vs plan's bidirectional guard; sufficient since instruction regex is case-insensitive |
| E: Positional bonus cap (0.15->0.18) | Correct | None |
| F: Trailing page ref stripping | Correct | None |
| Pattern 6 (not fixable) | Not touched | As planned |

Cross-iteration constraints from iterations 8, 24, 26, 27 are all respected.

---

## Performance Assessment

All changes are O(1) per candidate with bounded regex operations. On a 200-line document with 25 candidates on Hermes (no JIT):

| Phase | Estimated time |
|-------|---------------|
| `buildCandidates` (line processing + hard filters) | 5-15ms |
| OCR variant generation (up to 5 early lines x 2 variants) | < 1ms |
| `embed()` x 25 candidates | 3-8s (dominates) |
| Post-scoring bonuses | < 1ms |

Total regex overhead from all 6 changes: < 30ms. Well within the 10-second budget.

---

## Strengths

- Letter-adjacent guard pattern (`(?<=[a-z...])4` + `4(?=[a-z...])`) applied consistently across all digit->letter substitutions
- `hasPipePreamble` correctly gated inside `allPrecedingFiltered` block, ensuring the 0.18 cap only fires with structural evidence
- `looksLikeCookingInstruction` word-count pre-filter (`< 4`) prevents expensive regex on short candidates
- `stripTrailingPageRef` correctly placed in pipeline before OCR repair

---

## Observations (No Action Required)

1. **OCR repair path divergence risk**: The codebase now has 3 distinct OCR normalization contexts (blind repair, instruction-filter normalization, erratic-casing normalization). A shared `OCR_DIGIT_SUBSTITUTIONS` map would make cross-path consistency auditable.

2. **`normalizeErraticCasing` calls `hasErraticCasing` per-token**: Since each token is already a single word, the inner `split(/\s+/)` in `hasErraticCasing` always returns a one-element array. Correct but slightly redundant.

3. **`POLISH_COOKING_INSTRUCTION_STARTS` at ~50 alternations**: All anchored at `^`, so no backtracking risk. Common case (non-instruction) fails on first character.

4. **Change B `length <= 7` cap**: Not in the plan but well-justified. Document reasoning in iteration notes so future iterations don't remove it without understanding why.

---

## Test Results

- Unit tests: **37/37 passed**
- Real file CLI: **11/11 correct**

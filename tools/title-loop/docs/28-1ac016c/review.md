# Consolidated Code Review — Iteration 28

**Date:** 2026-03-17
**Scope:** `lib/text-classifier/title-extractor.ts` (HEAD~1 to working tree)
**Plan:** `tools/title-loop/docs/28-1ac016c/improvement-plan.md`

## Executive Summary

All 4 fixes from the improvement plan are correctly implemented and compose well. The `burstEnd` threading through `buildCandidates` → `isTitleAbsentPage` → `passesCorroboration` is clean. The dual-variant OCR repair, broadened overflow markers, blank-line-aware successor bonus, and unified prologue detector all work as designed.

Four bugs/inconsistencies were found and **fixed directly in the code** during this review. All 37 unit tests pass after fixes. CLI verification passes.

---

## Issues Found & Fixed

### Fix A: `applyBlindOcrRepair` defaulted to `"l"` instead of `"i"` for mixed-case text

**File:** `title-extractor.ts:881`
**Severity:** HIGH
**Impact:** `normalizeOcrTitle` calls `applyBlindOcrRepair` on the final selected title. If any `1` digits survived into the winner, they'd be replaced with `l` instead of `i` — re-corrupting text that the embedding scorer had correctly resolved. The improvement plan's own analysis shows `i` is correct for the vast majority of recipe words (`Braised`, `with`, `White`, `Wine`, `Sernik`).

**Fix applied:** Changed `applyBlindOcrRepairToken(token, "l")` → `applyBlindOcrRepairToken(token, "i")` in `applyBlindOcrRepair`. Updated `generateBlindOcrVariants` correspondingly so the `l`-variant is now the explicit fallback.

### Fix B: `applyBlindOcrRepairToken` ALL_CAPS branch used `[A-Z]` instead of `[A-ZÀ-Ż]`

**File:** `title-extractor.ts:849-850`
**Severity:** MEDIUM
**Impact:** Polish ALL_CAPS words like `ŻUREK` or `ŁOSOŚ` embedded in mixed-case titles wouldn't have `0→O` repair applied. The parent function `applyBlindOcrRepair` correctly uses `[A-ZÀ-Ż]` for its ALL_CAPS branch — the per-token helper was inconsistent.

**Fix applied:** Widened regex to `[A-ZÀ-Ż]`.

### Fix C: `isContinuation` fully subsumed `isProse` in the unified prologue detector

**File:** `title-extractor.ts:487-495`
**Severity:** MEDIUM
**Impact:** `isProse` (lowercase start + 4+ words) was dead code because `isContinuation` (lowercase start + 2+ words) is strictly broader. The word-count=2 threshold was intentional (to catch short continuation fragments like "creamy texture.") but undocumented, making the behavior more permissive than the plan stated.

**Fix applied:** Replaced the three predicates with two clearly separated ones: `isContinuation` (lowercase start, 2+ words) and `isBodyEnding` (comma-ending or long sentence-ending, 4+ words). Added comments explaining the threshold difference.

### Fix D: `burstEnd` fallback `?? 0` should be `?? lines.length`

**File:** `title-extractor.ts:727, 730`
**Severity:** LOW
**Impact:** When `burstEnd` equals `nonEmptyLines.length` (all lines consumed by burst), `nonEmptyLines[burstEnd]?.index` is `undefined`, falling back to `0`. This would cause `isTitleAbsentPage` to re-evaluate prologue lines instead of seeing "no lines remain." Edge case (no candidates would exist anyway), but semantically inverted.

**Fix applied:** Changed `?? 0` → `?? lines.length`.

---

## Issues Noted (Not Fixed — Deferred)

### 1. `passesCorroboration` called twice with no memoization

**Severity:** MEDIUM (performance)
**File:** `title-extractor.ts:1344, 1547`
**Impact:** Each call is O(contentWords × lines). On a 100-line document with 25 ALL_CAPS candidates, this is ~25,000 `.toUpperCase()` + `.includes()` calls, done twice. Pre-uppercasing lines once and caching results between call sites would halve the work.

### 2. `repairOcrText` called 3× per candidate line (single, 2-join, 3-join)

**Severity:** MEDIUM (performance)
**File:** `title-extractor.ts:648, 689, 703`
**Impact:** The single-line repair result could be cached and reused in join assembly since `repairOcrText` operates word-by-word. Would reduce repair calls from O(3N) to O(N).

### 3. `hasErraticCasing` called redundantly

**Severity:** LOW (performance)
**File:** `title-extractor.ts:662, 664, 900`
**Impact:** Called on `line.text` in the `if` condition, then again on `repairable` inside the block, then again per-token inside `normalizeErraticCasing`. Could compute once per line.

### 4. Positional boost cap only covers candidate index 0

**File:** `title-extractor.ts:1175-1185`
**Impact:** The `maxPositionalBoost` cap tracks `firstCandidate.score` but the direct-successor bonus also modifies candidates at `ci=1` and `ci=2` uncapped (+0.10). Comment says "covers all" but doesn't. Low practical risk — the bonus is small and only fires for candidates near section headers.

### 5. Unit tests don't cover the 4 new mechanisms

**Impact:** All 4 fixes are validated only via the eval suite (`eval_only.py`). The mock embed function cannot distinguish between `i` and `l` repair variants. No unit tests for: interleaved prologue detection, blank-line-skipping successor bonus, broadened overflow markers, erratic casing normalization.

**Recommendation:** Add targeted unit tests before iteration 29. Key scenarios:
- `"Bra1sed Cod w1th Wh1te W1ne"` → should produce `"Braised Cod with White Wine"` (not `Bralsed`)
- Section header + blank line + title → should extract title
- `[CORRUPTED TEXT FROM PREVIOUS PAGE - PARTIAL RECIPE]` preamble → should skip
- Interleaved instruction/prose (3+ lines) → should skip prologue
- `"KoPyTka z P¡eczarkami Leśnymi"` → should normalize to `"Kopytka z Pieczarkami Leśnymi"`

---

## Quality Metrics

| Aspect | Score | Notes |
|---|---|---|
| Architecture | 8/10 | `burstEnd` threading is clean; functions compose well |
| Code Quality | 7/10 | Good extraction of `applyBlindOcrRepairToken`; some magic numbers |
| Performance | 7/10 | 25-candidate cap is the key safeguard; corroboration/repair caching would help |
| Testing | 5/10 | Strong eval suite but unit tests lag behind the implementation |

## Strengths to Preserve

- The `buildCandidates` → `{ candidates, burstEnd }` return type change is minimal and clean
- `applyBlindOcrRepairToken` extraction eliminates the old copy-paste divergence between `normalizeOcrTitle` and candidate generation
- The `hasErraticCasing` threshold (`upperInner >= 2 && upperInner >= lowerInner * 0.3`) is well-calibrated — correctly catches `KoPyTka` while exempting `McDonald`
- The overflow marker `[...]` bracketed annotation check is safe by construction (`^`/`$` anchors)
- The subset dedup food-category suffix protection correctly uses `startsWith` to limit scope

## Verification

- **Unit tests:** 37/37 passing
- **CLI:** `npx tsx tools/title-loop/extract-title.ts tools/title-loop/input/*.real.txt` → OK

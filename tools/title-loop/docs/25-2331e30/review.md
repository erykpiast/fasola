# Code Review — Iteration 25 (Vocabulary Corroboration)

## Review Scope

**Target:** `lib/text-classifier/title-extractor.ts` + `lib/text-classifier/__tests__/title-extractor.test.ts`
**Changes:** +85 lines in title-extractor.ts, +93 lines in tests (after review fixes applied)
**Focus:** Architecture, code quality, performance, testing — compared against `improvement-plan.md`

## Executive Summary

The iteration adds **vocabulary corroboration** to filter orphaned OCR artifacts from multi-title assembly. The fix is well-targeted — it solves the FINNISH FLATBREADS failure without regressions. The implementation follows the improvement plan closely, with one smart deviation (≥3 alpha chars instead of ≥4 raw chars for content words).

**Review fixes applied:**
1. Consolidated `corroborationScore()` + inline threshold logic into single `passesCorroboration()` helper, with shared `extractContentWords()` utility — eliminates all duplication
2. Removed unnecessary `export` on `corroborationScore` (now inlined into `passesCorroboration`, no external consumers)
3. Fixed test indentation (off by 2 spaces in all 3 new test cases)

## Quality Metrics

| Aspect | Score | Notes |
|---|---|---|
| Architecture | 8/10 | Clean integration at two well-chosen points; dual application (pre-filter + post-filter) is defense-in-depth, not redundancy |
| Code Quality | 8/10 | After DRY fix — `passesCorroboration` eliminates 3x duplication of threshold logic |
| Performance | 9/10 | O(candidates × words × lines) ≈ ~200 string ops — negligible vs. embedding cost |
| Testing | 8/10 | Three focused test cases covering the key scenarios; good use of realistic document structure |

## Issues Found and Fixed

### 1. DRY Violation — Duplicated Threshold Logic (MEDIUM)

**Before:** Content-word extraction + threshold calculation was copy-pasted in 3 places:
- `corroborationScore()` (score computation only)
- Pre-filter block (~line 1125) — inline threshold decision
- Post-filter block (~line 1316) — inline threshold decision

**Fix:** Collapsed `corroborationScore()` into `passesCorroboration()` and extracted `extractContentWords()` so the word-splitting logic exists in exactly one place. Removed the now-unused export.

### 2. Test Indentation (LOW)

**Before:** The 3 new test cases inside `describe("corroboration")` had bodies indented at 4 spaces instead of 6 (2nd and 3rd `it()` blocks were at 2 spaces instead of 4).

**Fix:** Corrected all indentation to be consistent with the rest of the test file.

## Design Analysis

### Dual corroboration (pre-filter + post-filter) — Intentional and correct

The corroboration check runs at two distinct points:

1. **Pre-filter** (before threshold computation): Removes artifacts from `scoredForThreshold` so they don't inflate the threshold via early-position bonus. Safety: only removes if ≥2 ALL_CAPS candidates remain.

2. **Post-filter** (in multi-title assembly): Removes artifacts from the final `selected` set. Safety: falls back to unfiltered set if <2 candidates survive.

These serve different purposes — the pre-filter affects which candidates survive threshold filtering, while the post-filter affects the final output. If the pre-filter's safety check prevents removal (e.g., only 2 ALL_CAPS total, one is artifact), the post-filter catches it.

### Content word threshold: ≥3 alpha chars (deviation from plan)

The plan specified `w.length >= 4` (raw length). The implementation uses `w.replace(/[^a-zA-ZÀ-ÿ]/g, "").length >= 3` (alpha-only length after stripping punctuation). This is a better choice:

- Handles punctuation-rich OCR output (e.g., "DAT" → 3 alpha chars, included as content word)
- "DAT" with raw length 3 would be excluded by the plan's ≥4 threshold, making corroboration trivially pass — the fix wouldn't work
- Unicode-aware via `À-ÿ` range (important for Polish recipes)

## Strengths to Preserve

- **Minimal, targeted fix** — only touches the multi-title path, single-title pages completely unaffected
- **Good safety guards** — both pre-filter and post-filter have "don't remove all candidates" fallbacks
- **Clear comments** explaining the purpose of each corroboration step
- **Test cases match real failure mode** — the artifact test uses realistic garbled OCR preamble

## Verification Results

- **Unit tests:** 36/36 passing
- **Type check:** Clean
- **CLI (11 real files):** All correct, including the previously-failing FINNISH FLATBREADS case
- **No regressions**

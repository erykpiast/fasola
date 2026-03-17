# Consolidated Code Review — Iteration 27

**Target:** `lib/text-classifier/title-extractor.ts` + tests (~150 lines changed)
**Plan:** `tools/title-loop/docs/27-51f970e/improvement-plan.md` (4 patterns)
**Tests:** 37/37 passing, CLI extraction verified

---

## Executive Summary

All 4 patterns from the improvement plan are implemented. The code is well-commented, the OCR repair refactoring (DRY extraction of `applyBlindOcrRepair`) is clean, and the new `CATEGORY_SECTION_LABELS` / dedup protection logic is sound. One medium-priority issue: the direct-successor bonus is applied after the positional cap, allowing over-boost beyond the plan's intended +0.15 max.

---

## Issues

### 🟠 HIGH: Direct-successor bonus escapes positional cap (plan deviation)

**File:** `title-extractor.ts:1069-1098`

The improvement plan states: "They [first-after-preamble and direct-successor bonuses] share the existing `maxPositionalBoost` cap of +0.15, so they cannot over-boost together."

In the implementation, the cap is applied at line 1071-1078, but the direct-successor bonus is applied *after* the cap at line 1094-1097. When both fire (e.g., `FISH & SEAFOOD\nHalibut...`), the first candidate gets:
- Preamble bonus: +0.12 → capped to +0.15 total
- Direct-successor: +0.10 uncapped
- **Actual total: +0.25** (vs intended +0.15)

This may be harmless in practice (all tests pass), but deviates from the plan and could cause unexpected ranking in edge cases where a non-title line follows a section header.

**Fix:** Move the cap after the direct-successor loop, so both bonuses are covered:

```typescript
// Apply direct-successor bonus BEFORE the cap
for (let ci = 0; ci < scored.length && ci <= 2; ci++) { ... }

// Then cap the FIRST candidate's total positional boost
const maxPositionalBoost = 0.15;
const totalPositionalBoost = firstCandidate.score - baseScoreBeforePositionalBonuses;
if (totalPositionalBoost > maxPositionalBoost) { ... }
```

Note: this may require retuning thresholds if the 3 Pattern 2 cases relied on the +0.25 boost to pass.

### 🟡 MEDIUM: `findBurstEnd` overflow fallback skips to end of walk

**File:** `title-extractor.ts:462` (committed) / line ~462 in working tree

When the overflow marker walk finds no termination condition (no separator, no 2+ blanks, no ALL_CAPS heading), the fallback changed from `overflowEnd = k + 1` to `overflowEnd = m`. If `m` walked to `lines.length`, this skips the entire document past the overflow marker.

In practice this only triggers for lines matching `OVERFLOW_MARKERS` (generated test files, not real OCR), so risk is low. But the behavioral change is more aggressive than the old code.

### 🟡 MEDIUM: `isBodyProse` diacritics coverage

**File:** `title-extractor.ts:360`

```typescript
function isBodyProse(line: string): boolean {
  return /^[a-ząćęłńóśźż]/.test(line) && wordCount(line) >= 4;
}
```

Covers English + Polish lowercase starts. If OCR text contains French (`à`, `é`), German (`ü`, `ö`), or other accented lowercase starts, they won't match. For a Polish/English recipe app this is acceptable, but worth noting if scope expands.

---

## Quality Metrics

| Aspect       | Score | Notes                                                            |
|-------------|-------|------------------------------------------------------------------|
| Architecture | 8/10  | Clean separation; `buildCandidates` returning `burstEnd` is good |
| Code Quality | 8/10  | Well-commented, DRY refactoring of OCR repair                    |
| Performance  | 9/10  | New code paths are O(candidates) or O(lines), well within budget |
| Testing      | 8/10  | New test for VEGETABLES-type; no test for direct-successor bonus |
| Security     | N/A   | Pure text processing, no external I/O                            |

## Strengths to Preserve

- **Excellent comments**: Every bonus, heuristic, and guard has a comment explaining *why* it exists and what pattern it addresses. Cross-iteration context in the plan is thorough.
- **DRY refactoring**: Extracting `applyBlindOcrRepair` from `normalizeOcrTitle` eliminates duplication cleanly.
- **Layered approach**: Blind OCR repair as additional candidates (not replacement) is conservative and safe — the original stays in the pool.
- **`burstEnd` propagation**: Passing burst boundary from `buildCandidates` to corroboration is architecturally clean.

## Proactive Improvements

1. **Add test for direct-successor bonus** — no unit test explicitly covers the case where a candidate immediately follows a section label and the bonus fires. The VEGETABLES test covers dedup protection but not scoring.

2. **Consider `\p{Ll}` for `isBodyProse`** — Unicode-aware lowercase detection would future-proof the regex:
   ```typescript
   return /^\p{Ll}/u.test(line) && wordCount(line) >= 4;
   ```

## Verdict

Ship-ready with the cap ordering noted. The over-boost is the only deviation from the plan, and it may actually be load-bearing for the Pattern 2 cases. If you want strict plan compliance, reorder the cap; otherwise document the actual cap behavior for the next iteration.

# Code Review: Iteration 30 (a2f9b6c)

## Review Scope
Target: `lib/text-classifier/title-extractor.ts`, `lib/text-classifier/food-dictionary.ts`
Focus: Correctness, performance, plan adherence

## Executive Summary

All 4 planned changes were implemented correctly. The code had one regression (Baked Eggs losing `& Coriander`) caused by Change 1's "always emit both standalone and merged" approach — **fixed during this review** by conditionally emitting the standalone only when the merged form fails hard filters. 8 unplanned changes were found, mostly carryovers from iter 29. No performance concerns. No security issues.

---

## CRITICAL Issue (Fixed)

### Continuation merge regression: standalone wins over merged form
**File:** `title-extractor.ts:654-665`
**Impact:** "Baked Eggs with Feta, Harissa Tomato Sauce & Coriander" extracted as "Baked Eggs with Feta, Harissa Tomato Sauce" (missing `& Coriander`).

**Root cause:** Change 1 emits both the standalone prefix and the merged continuation form. MiniLM may score the shorter standalone higher, causing it to survive the threshold while the merged form (the correct complete title) doesn't. The prefix filter at lines 1517-1528 only removes the standalone when BOTH forms survive the threshold.

**Fix applied:** Only emit the standalone as a fallback when the merged form fails hard filters. For valid continuations (`& Coriander`), only the merged form is emitted (matching original behavior). For annotation merges (`(OCR CORRUPTION: ...)`), the merged form fails hard filters and the standalone is emitted as fallback.

---

## Plan Adherence: 4/4

| Change | Plan | Implemented | Correct |
|--------|------|-------------|---------|
| 1. Preserve standalone on continuation merge | lines 646-658 | lines 654-665 | Yes (with regression fix above) |
| 2. Add "sole" to food dictionary | food-dictionary.ts | line 10 | Yes |
| 3. Polish cooking instruction threshold ≥2 words | looksLikeCookingInstruction | lines 367-377 | Yes |
| 4. Pipe+ALL_CAPS positional cap → 0.22 | maxPositionalBoost | lines 1249-1250 | Yes |

---

## Unplanned Changes

8 additional changes not in the iter 30 plan. Most are iter 29 carryovers already in the baseline:

| Change | Source | Risk |
|--------|--------|------|
| `stripTrailingPageRef` function | iter 29 plan | Low |
| OCR `4→a` normalization in `passesHardFilters` | iter 29 plan | Low |
| Multi-word garbled camelCase detection (3-7 chars) | iter 29 plan | Low |
| Expanded `applyBlindOcrRepairToken` (4→A, 5→S, ¡→I, €→E) | iter 29 plan | Low |
| Mc/Mac exemption in garbled detection | iter 29 plan | Low |
| `hasErraticCasing` threshold 3→5 | New in iter 30 | Low |
| Metadata guard in 2-line/3-line joins | New in iter 30 | Low-Medium |
| Pre-merged prefix filter (lines 1517-1528) | New, companion to Change 1 | Low (now safety net) |

The **pre-merged prefix filter** (lines 1517-1528) was a necessary companion to the original Change 1 design. With the regression fix, it's now a safety net — it won't fire in normal operation but is harmless defense-in-depth.

---

## Performance Assessment

No concerns. All changes are O(1) per candidate:

- The continuation merge fix adds one `passesHardFilters` call per merged line (at most ~5 lines). This duplicates work that the downstream loop already does, but the cost is negligible (<1ms total).
- The 25-candidate cap before embedding calls is the controlling firewall. Nothing in these changes can increase the number of embedding calls.
- All new regexes use anchors and fixed-width quantifiers. No ReDoS risk.
- The O(n^2) prefix filter at 1517-1528 operates on `selected` (typically 1-5 candidates). Safe.

---

## Code Quality Notes

### Polish cooking instruction regex: Unicode boundary
The change from `\b` to `(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])` is correct. JS `\b` doesn't recognize Polish letters as word characters, so `smaż\b` incorrectly matches `Smażona`. The negative lookahead handles end-of-string correctly (no following character = assertion passes).

### OCR normalization gap
`passesHardFilters` only normalizes `4→a` for the cooking instruction re-check (lines 419-422). The `5→s` substitution is not covered, meaning `Po5yp ziemniaki` would not be caught as a cooking instruction. Impact is limited — affected verbs (`posyp`, `posiekaj`) would need the digit to land in a position that preserves a plausible vowel ratio.

### `hasErraticCasing` threshold: 3→5
Words of 3-4 characters are now exempt from erratic casing detection. Defensible (reduces false positives on short words) but loosens the filter slightly. 4-char garbled tokens like `aBCd` would need to be caught by the vowel-ratio check in `isLikelyGarbled` instead.

### Continuation line suppression is load-bearing
The `i++` skip in the continuation merge (line 661) prevents the continuation line itself (e.g., `& Coriander`) from entering the pool as a standalone. This is load-bearing — lines like `& Coriander` CAN pass `passesHardFilters`. The skip is correct behavior, not a redundant safety measure.

---

## Quality Metrics

| Aspect | Score | Notes |
|--------|-------|-------|
| Architecture | 8/10 | Clean separation of candidate generation, scoring, and post-processing. Continuation merge fix is well-placed. |
| Code Quality | 7/10 | Complex but well-commented. The 1500+ line file is growing; each iteration adds more special cases. |
| Performance | 9/10 | All changes within budget. 25-candidate cap is effective. |
| Testing | 7/10 | 37 unit tests pass. New changes (prefix filter, metadata join guard, continuation fallback) lack dedicated unit tests. |
| Plan Adherence | 9/10 | All planned changes implemented. Regression fix is a justified deviation. |

---

## Verification

- Unit tests: 37/37 pass
- Real files CLI: All 11 pass (Baked Eggs regression fixed)
- SAFFRON WHEAT BUNS: Continuation merge produces correct full title
- `Smażona zielona fasolka`: Now extracts `Smażona zielona fasolka GREEN BEANS BORKEUM` (includes English translation); eval still passes via substring match. This differs from iter 30 baseline (`Smażona zielona fasolka` only) but is not caused by the planned changes.

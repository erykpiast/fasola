# Iteration 26 → 27 Improvement Plan

## Title

Fix generated-file title extraction: OCR repair gaps, section-label merge blocking, and spillover handling

## Status

Draft

## Authors

Claude — 2026-03-17

## Overview

Iteration 26 has 0 real-file failures and 16 generated-file failures across 6 patterns.
Real accuracy is 100% (11/11). Combined accuracy is 85.6%.

The failures share two root causes:

1. **OCR repair has blind spots** — the food dictionary lacks common English words
   (`with`, `the`, `and`, `dip`, `pie`), so `repairOcrWord` can't fix them. Partially-
   repaired titles like `Braised Cod w1th White Wine` score poorly on embeddings and
   get skipped.

2. **Structural heuristics are too rigid** — section labels block multi-line title
   merges even when the label is clearly a title continuation; spillover markers don't
   trigger a wider scan; and mid-recipe pages aren't reliably detected when body text
   precedes ingredients.

The fix addresses both causes with targeted changes: expand the OCR repair dictionary,
relax section-label merge blocking for title continuations, and improve spillover/
mid-recipe detection. The pipeline architecture is unchanged.

## Background / Problem Statement

### Failure breakdown

| Pattern | Count | Returns | Root cause |
|---------|-------|---------|------------|
| A. Corrupted spillover — title absent | 5 | empty | `findBurstEnd` skips spillover marker but doesn't scan far enough for the title |
| B. Heavy digit corruption — title rejected | 2 | empty | `repairOcrText` can't fix `w1th`, `D1p` (not in food dictionary) → corrupted title fails embedding scoring |
| C. Partial corruption — wrong body line | 3 | wrong | Same as B — partially-repaired title scores lower than a body text line |
| D. Section header before title | 3 | wrong/empty | First-after-preamble bonus isn't firing for all cases; pipe-delimited metadata followed by title not handled |
| E. Multi-line title truncated | 1 | partial | `VEGETABLES` is in `SECTION_LABELS`, so caps-coalescing refuses to merge it with preceding `LEMON HERB ROASTED` |
| F. Mid-recipe page start | 2 | wrong | `isTitleAbsentPage` checks first 3 lines for ingredients/instructions, but body text (prose) isn't detected |

### What works well (do not change)

- Pipeline architecture: candidate generation → hard filters → embedding scoring → multi-title assembly
- Dictionary-guided OCR repair mechanism (just needs a wider dictionary)
- Vocabulary corroboration for multi-title assembly (iteration 25 fix)
- Compound title dedup protection
- Bilingual detection (both ALL_CAPS and mixed-case variants)
- Real file accuracy: 100%
- Shorter-wins dedup rule (DO NOT CHANGE — see architecture.md warning)

## Goals

- Fix all 16 generated-file failures without regressing real files
- Keep changes minimal and localized within the existing pipeline stages

## Non-Goals

- Replacing the embedding model or scoring architecture
- Reworking the overall pipeline structure
- Adding new generated test files
- Changing the dedup logic

---

## Detailed Design

### Fix 1: Expand OCR repair dictionary with common English words (Patterns B, C)

**Root cause detail:** `repairOcrWord` only matches against `FOOD_DICTIONARY`. Common
English words that appear in recipe titles — prepositions (`with`, `the`, `for`),
adjectives (`old`, `new`, `hot`), and short food terms (`dip`, `pie`, `jam`, `bun`) —
are missing. When these words contain OCR digits, repair fails and the candidate enters
embedding scoring with residual corruption.

Tracing Pattern B failure `Bra1sed Cod w1th Wh1te W1ne`:
- `Bra1sed` → `braised` ✓ (in dictionary)
- `Cod` → no digits, passes through ✓
- `w1th` → tries `with` (1→i) → NOT in dictionary → stays `w1th` ✗
- `Wh1te` → `white` ✓
- `W1ne` → `wine` ✓

Result after repair: `Braised Cod w1th White Wine` — the residual `w1th` degrades
embedding quality enough to push the title below threshold.

**Fix:** Add a `COMMON_TITLE_WORDS` set to `food-dictionary.ts` containing ~50 words
that commonly appear in recipe titles but aren't food-specific:

```typescript
// Common English words that appear in recipe titles (for OCR repair)
const COMMON_TITLE_WORDS: Set<string> = new Set([
  // Prepositions & conjunctions
  "with", "from", "over", "under",
  // Adjectives
  "classic", "simple", "quick", "easy", "light",
  "thick", "thin", "crispy", "creamy", "spicy",
  // Short food terms missing from main dictionary
  "dip", "pie", "bun", "buns", "roll", "rolls",
  "jam", "jelly", "tart", "cake", "loaf",
  "soup", "stew", "hash", "bowl", "wrap",
  // Polish common title words
  "pieczony", "pieczone", "smażony", "smażone",
  "gotowany", "gotowane", "duszone", "duszony",
  "domowy", "domowe", "tradycyjny", "tradycyjne",
]);
```

Merge this into `FOOD_DICTIONARY` (or check both sets in `repairOcrWord`). The
simpler approach is to add these words directly to `FOOD_DICTIONARY`.

**Expected impact:** Fixes B (2) and C (3) = 5 failures. After full repair,
`Braised Cod with White Wine` scores correctly on embeddings and wins over body text.

### Fix 2: Allow section-label words in multi-line title merges (Pattern E)

**Root cause detail:** In the caps-coalescing loop (line ~510-548), the condition
`!isSectionLabel(next.text)` prevents `VEGETABLES` from merging with the preceding
`LEMON HERB ROASTED`. But `LEMON HERB ROASTED` is clearly an incomplete title
fragment (3 words, ends mid-phrase). The section-label check is correct in general
(prevent merging `SKŁADNIKI` into a title), but too aggressive for single words
that complete an obviously truncated preceding line.

**Cross-iteration tension:** Iterations 18 and 22 deliberately added `"vegetables"`
(and other food-category words) to `SECTION_LABELS` to prevent standalone `VEGETABLES`
from being selected as a title. This fix relaxes that protection for merges while
preserving it for standalone candidates. The `"placki"` precedent from iteration 22
(removed from `SECTION_LABELS` entirely because it starts recipe titles) shows the
project already acknowledges that category words can legitimately appear in titles.

**Fix:** Relax the section-label merge block when the **preceding merged text** is
short (≤ 4 words) and the next line is a single word. The heuristic: a short ALL_CAPS
fragment followed by a single ALL_CAPS word that happens to be a section label is more
likely a fragmented title than a title followed by a section header.

```typescript
// In caps-coalescing loop, replace:
//   !isSectionLabel(next.text)
// with:
//   !isSectionLabel(next.text) ||
//   (wordCount(next.text) === 1 && wordCount(merged) >= 2 && wordCount(merged) <= 4)
```

Additionally, check that the repaired form of the section label doesn't match either.
The existing code already checks `!isSectionLabel(repairOcrText(next.text))` — extend
the relaxation to also apply when this check would have blocked the merge.

**Safety:** Only fires for single-word section labels following short ALL_CAPS
fragments. Multi-word section labels (`SPOSOB WYKONANIA`) are unaffected. And
`SKŁADNIKI` following a complete 5+ word title would NOT merge (the word count
guard prevents it). Standalone `VEGETABLES` as a candidate (without a preceding
short fragment) is still blocked by SECTION_LABELS — this relaxation only applies
to the merge path, not the standalone candidate filter.

**Expected impact:** Fixes E (1) = 1 failure. `LEMON HERB ROASTED` + `VEGETABLES`
→ `LEMON HERB ROASTED VEGETABLES`.

### Fix 3: Improve spillover handling in `findBurstEnd` (Pattern A)

**Root cause detail:** When a file starts with `[CORRUPTED SPILLOVER...]`, the
hard filter in `passesHardFilters` correctly rejects the spillover annotation line.
The `OVERFLOW_MARKERS` regex already includes `SPILLOVER` as a match, so
`findBurstEnd` detects the marker. However, after detecting the marker, `findBurstEnd`
looks for a separator (blank line or `====`) to determine where the preamble ends.
If the spillover content continues as body text without a clear separator,
`findBurstEnd` doesn't advance far enough. The title may be buried at line 10+ or
absent entirely, and the extractor gives up because no candidate emerges near the
(insufficiently advanced) burst end.

**Note (iteration 25 context):** Iteration 25 analyzed this same pattern and noted
that `findBurstEnd` "doesn't skip the garbled preamble lines (they're long, not
short), so the proposed `i > 0` guard would never fire." The core issue is
skip-distance, not marker detection.

**Fix:** Two changes:

1. Improve `findBurstEnd`'s post-marker skip logic. After detecting an overflow
   marker (including `SPILLOVER`), skip ALL subsequent lines until either:
   (a) a gap of ≥2 consecutive blank lines,
   (b) a separator line (`====`, `----`), or
   (c) an ALL_CAPS line with ≥2 words (structural signal for a new recipe heading).

   This replaces the current "look for next blank line" logic which fails when
   spillover body text continues without separators.

2. In `extractTitleWithEmbeddings`, when `findBurstEnd` was able to skip a spillover
   preamble, relax the position preference — don't penalize candidates at position 10+
   just because they're far from line 0. The title position after a spillover can be
   anywhere in the document.

   Specifically: when `burstEnd > 0` and an overflow marker was detected, set the
   position factor to treat the first post-burst candidate as position 0 for scoring.
   This is already partially handled by the candidate-relative position bonus, but
   `findBurstEnd` needs to actually advance past the spillover content for it to work.

**Expected impact:** Fixes A (5) = 5 failures for cases where the title exists later
in the document. For cases where the title is truly absent (was on the previous page),
the extractor should return empty — which it already does when no candidates survive.

### Fix 4: Strengthen first-after-preamble bonus for Pattern D cases

**Root cause detail:** The first-after-preamble bonus (line ~964-977) checks whether
ALL preceding lines were filtered or empty. For the Halibut case, `FISH & SEAFOOD`
is filtered as a section label, so the check should pass. But the bonus is only +0.08.
If the actual title (`Halibut with Saffron Cream Sauce`) has a weak rawScore against
the title reference embedding (it's a mixed-case description-like string), +0.08 may
not be enough to clear the threshold.

For Ogórkowa Zupa, the pipe-delimited metadata line is correctly filtered, and
`OGÓRKOWA ZUPA` at position 2 should be an ALL_CAPS structural heading candidate.
The issue may be that `OGÓRKOWA` contains the OCR-challenging `Ó` which could affect
embedding quality, or that the first-after-preamble check doesn't fire because there's
a non-filtered blank line at position 1.

**Fix:** Two adjustments:

1. Make the first-after-preamble check more robust by also treating blank lines as
   "filtered" (they already are treated as empty, but ensure the check includes them):

   ```typescript
   const allPrecedingFiltered = lines
     .slice(0, firstCandidate.position)
     .every((line) => {
       const trimmed = line.trim();
       return trimmed === "" || !passesHardFilters(trimmed) || isSectionLabel(trimmed);
     });
   ```

   The addition of `isSectionLabel(trimmed)` catches cases where a section label
   passes hard filters at an earlier iteration's filter set but was added to
   `SECTION_LABELS` later without being added to `passesHardFilters`. (Currently
   `passesHardFilters` does check `isSectionLabel`, so this is a safety net.)

2. Increase the first-after-preamble bonus from +0.08 to +0.12 when the filtered
   preamble contained a section label or metadata line (not just empty lines). This
   gives stronger positional evidence that the first surviving candidate IS the title.

   **Cross-iteration note:** Iteration 24 introduced the candidate-relative position
   bonus (~+0.08-0.12 for position 0 among surviving candidates). When both bonuses
   fire for the same candidate, the combined positional boost could reach ~+0.24.
   To prevent over-boosting non-title candidates: make the first-after-preamble bonus
   and candidate-relative position bonus partially exclusive — if both apply, cap
   their combined contribution at +0.15.

**Expected impact:** Fixes D (3) = 3 failures. The stronger bonus pushes
`Halibut with Saffron Cream Sauce` and `OGÓRKOWA ZUPA` above threshold.

### Fix 5: Improve mid-recipe page detection (Pattern F)

**Root cause detail:** `isTitleAbsentPage` checks if the first 3 non-empty lines are
all ingredients or cooking instructions. But:

- Sweet Potato Salad: starts with ingredient lines → `isTitleAbsentPage` should detect
  this. Yet the extractor returns `½ red onion, thinly sliced`. This means either
  `isTitleAbsentPage` returned false (not all 3 lines matched), or the title-absent
  guard (line ~1171) didn't fully filter the result.

  Looking at the guard: it requires `rawScore >= 0.10` AND `position <= 2`. An
  ingredient line at position 0-2 could survive if it has rawScore ≥ 0.10 — which
  shouldn't happen for ingredients, but `½ red onion, thinly sliced` might be short
  enough to have a mediocre (not terrible) embedding score.

  **Hmm** — but `½ red onion, thinly sliced` should be caught by `looksLikeIngredient`
  (has `½` = starts with number? No — `½` is not matched by `/^\s*(?:[-•*]\s*)?\d/`
  because `½` is not `\d`). This is a bug in `startsWithNumber` — Unicode fractions
  aren't matched.

- Mushroom Risotto: starts with `Reduce heat and stir...` — prose body text, not
  ingredients. `looksLikeCookingInstruction` should catch this (starts with `Reduce`),
  but `Reduce` is NOT in `COOKING_INSTRUCTION_STARTS`. Another missing verb.

**Fix:**

1. Add Unicode fraction characters to `startsWithNumber`:
   ```typescript
   function startsWithNumber(line: string): boolean {
     return /^\s*(?:[-•*]\s*)?[\d½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/.test(line);
   }
   ```

2. Add missing cooking verbs to `COOKING_INSTRUCTION_STARTS`: `reduce`, `bring`,
   `toss`, `cut`, `trim`, `shape`, `form`. Wait — checking line 317... `reduce`,
   `bring`, `toss`, `cut`, `trim`, `shape`, `form`, `scatter`, `score`, `pat`, `rub`,
   `skim`, `strain`, `heat`, `discard`, `rest`, `marinate`, `wrap` — these are
   ALREADY in the regex (added in iteration 24). Let me re-read...

   Yes, line 317 includes `reduce|bring|toss|cut|trim|shape|form|scatter|score|pat|rub|skim|strain|heat|discard|rest|marinate|wrap`. So `reduce` IS covered.

   The issue with Mushroom Risotto might be different. `Reduce heat and stir...` — the
   verb is `Reduce` which IS in the pattern. So `looksLikeCookingInstruction` should
   return true for this line. And `isTitleAbsentPage` checks `looksLikeCookingInstruction`.

   Let me re-examine: the requirement is that ALL of the first 3 non-empty lines match.
   If one of the 3 lines is neither ingredient nor instruction (e.g., a descriptive
   sentence), the check fails. That's probably what's happening.

   **Alternative approach for Mushroom Risotto:** The real fix is that when the page
   contains no title in the early lines AND a clear recipe title appears deep in the
   document (position 20+), the title likely belongs to a different recipe. The
   title-absent guard already filters `position <= 2`, which should prevent picking
   up `CARPACCIO DI PESCE SPADA` from position 20+. But the feedback says it IS
   being extracted — so maybe the `titleAbsent` flag isn't being set.

   **Fix for `isTitleAbsentPage`:** Add body-prose detection alongside ingredient
   and cooking-instruction checks. A line starting with a lowercase letter and having
   4+ words is prose continuation, not a title:

   ```typescript
   function isBodyProse(line: string): boolean {
     return /^[a-ząćęłńóśźż]/.test(line) && wordCount(line) >= 4;
   }

   function isTitleAbsentPage(lines: Array<string>): boolean {
     const nonEmptyLines = lines.map(l => l.trim()).filter(l => l.length > 0);
     if (nonEmptyLines.length < 3) return false;
     const first3 = nonEmptyLines.slice(0, 3);
     return first3.every(line =>
       looksLikeIngredient(line) ||
       looksLikeCookingInstruction(line) ||
       isBodyProse(line)
     );
   }
   ```

   Keep the strict "all 3" threshold (not "2 of 3") to minimize false positives.
   Recipe titles are capitalized, so lowercase start is a reliable prose indicator.

   **Cross-iteration tension with iteration 23:** Iteration 23 added a last-resort
   fallback that returns the first hard-filter-passing candidate when embedding-based
   logic produces nothing. This pulls in the opposite direction — iteration 23 made
   the system more aggressive about returning *something*, while this fix makes it
   more aggressive about returning *nothing* for mid-recipe pages.

   **Resolution:** `isTitleAbsentPage` should raise the extraction threshold (require
   higher rawScore + early position), NOT act as a hard gate that prevents all
   extraction. If `isTitleAbsentPage` is true but a position-0 candidate passes hard
   filters with rawScore ≥ 0.10, the last-resort fallback from iteration 23 should
   still be allowed to fire. This ensures that pages which genuinely start with a
   title (but happen to have body-prose-like lines nearby) aren't suppressed.

**Expected impact:** Fixes F (2) = 2 failures.

---

## Summary of Changes

### Modified file: `lib/text-classifier/food-dictionary.ts`

| Change | Description |
|--------|-------------|
| Add common title words | ~50 words: prepositions, adjectives, short food terms |

### Modified file: `lib/text-classifier/title-extractor.ts`

| Change | Location | Patterns Fixed |
|--------|----------|----------------|
| Relax section-label merge block for single-word continuations | `buildCandidates`, caps-coalescing loop (~line 525) | E |
| Improve post-marker skip distance (marker already detected; fix skip logic) | `findBurstEnd` (~line 400) | A |
| Strengthen first-after-preamble bonus for section-label preambles | `extractTitleWithEmbeddings` (~line 964) | D |
| Add Unicode fractions to `startsWithNumber` | `startsWithNumber` (~line 101) | F |
| Add body-prose detection to `isTitleAbsentPage` | `isTitleAbsentPage` (~line 338) | F |

### No changes to

- Embedding model, reference strings, or scoring formula
- Dedup logic (shorter-wins rule)
- Multi-title assembly logic
- Bilingual detection
- Threshold computation

---

## Testing Strategy

### Primary validation

Run `tools/title-loop/title-loop.py` and confirm:
- All 16 generated-file failures are fixed
- All 11 real files continue to pass (no regressions)

### Unit test cases to add

1. **OCR repair with common words:** Input `"Bra1sed Cod w1th Wh1te W1ne"` →
   repaired to `"Braised Cod with White Wine"`. Validates dictionary expansion.

2. **Section-label merge in title:** Input with `LEMON HERB ROASTED` on line 1 and
   `VEGETABLES` on line 2 → merged as `LEMON HERB ROASTED VEGETABLES`.

3. **Unicode fraction ingredient detection:** `"½ red onion, thinly sliced"` →
   `startsWithNumber` returns true.

4. **Body-prose title-absent detection:** Input starting with `"Reduce heat and stir..."`
   followed by more body text → `isTitleAbsentPage` returns true.

5. **Spillover skip:** Input with `[CORRUPTED SPILLOVER...]` followed by body text
   then a title at line 10 → title correctly extracted.

### Edge cases to verify

- A recipe titled exactly `"Vegetable Soup"` where `"VEGETABLES"` appears on its own
  line → should NOT be merged if preceded by 5+ word title (word count guard)
- A recipe starting with `"½ cup"` as the first ingredient but with a title on line 0
  → `isTitleAbsentPage` should NOT fire because line 0 has the title
- Single-word section label `"SKŁADNIKI"` at line 2 following a complete title at
  line 0 → should NOT merge (preceding merged text would be ≥5 words)
- Page with body prose on lines 0-2 but a valid title at position 0 that passes hard
  filters → `isTitleAbsentPage` must NOT suppress extraction (iteration 23 last-resort
  fallback must still fire)

---

## Performance Considerations

All changes are to string matching and heuristic checks. No additional embedding calls.
The dictionary expansion adds ~50 words to a Set lookup (O(1)). No performance impact.

---

## Security Considerations

None. All changes are local text processing.

---

## Implementation Phases

### Phase 1: Core fixes (single change set)

1. Add common title words to `FOOD_DICTIONARY`
2. Relax section-label merge block for single-word continuations
3. Add Unicode fractions to `startsWithNumber`
4. Add body-prose detection to `isTitleAbsentPage`
5. Improve spillover handling in `findBurstEnd`
6. Strengthen first-after-preamble bonus

All changes are independent and can be implemented in any order. Run the evaluation
harness once after all changes to verify.

---

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| Dictionary expansion | Over-correction: common words might cause false repairs in non-title contexts | Only triggers when word contains OCR-artifact chars; dictionary match is positive signal |
| Section-label merge relaxation | Could merge section labels into titles; partially reverses iteration 18/22 protections | Guarded by word count (preceding ≤4 words, next = single word); multi-word labels unaffected; standalone candidates still blocked |
| Body-prose detection in `isTitleAbsentPage` | False positives: pages with lowercase titles | Recipe titles are capitalized; lowercase start is a reliable prose indicator |
| First-after-preamble bonus increase | Could over-boost when combined with iter-24 candidate-relative position bonus | Cap combined positional boost at +0.15; only fires when all preceding lines were filtered |

---

## Open Questions

1. **Should common title words go into `FOOD_DICTIONARY` or a separate set?**
   Adding to `FOOD_DICTIONARY` is simpler (one lookup). A separate set keeps the
   dictionary semantically focused. **Recommendation:** Add directly to `FOOD_DICTIONARY`
   — the dictionary's purpose is OCR repair, not food taxonomy.

2. **Should the `isTitleAbsentPage` body-prose threshold be "all 3" or "2 of 3"?**
   "All 3" is safer (fewer false positives). "2 of 3" catches more mid-recipe pages.
   **Recommendation:** Keep "all 3" with the expanded detection (ingredients + instructions
   + body prose). If that doesn't catch all Pattern F cases, relax to "2 of 3".

3. **Spillover handling: how far should `findBurstEnd` skip?** Currently it looks for
   the next blank line or separator after the marker. For spillover, the body text may
   continue for many lines without a clear separator. **Recommendation:** Skip until
   either (a) ≥2 consecutive blank lines, (b) a separator line (`====`, `----`), or
   (c) an ALL_CAPS line with ≥2 words (likely the next recipe title).

---

## References

- Iteration 26 feedback: `tools/title-loop/docs/26-e8ee23c/feedback.md`
- Iteration 25 improvement plan: `tools/title-loop/docs/25-2331e30/improvement-plan.md`
- Pipeline architecture: `tools/title-loop/docs/architecture.md`
- Accuracy history: `tools/title-loop/docs/iter.txt`
- Food dictionary: `lib/text-classifier/food-dictionary.ts`
- Title extractor: `lib/text-classifier/title-extractor.ts`

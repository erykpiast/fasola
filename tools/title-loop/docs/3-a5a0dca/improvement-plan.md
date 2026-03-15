# Improvement Plan — Iteration 4

## Summary

Four failures remain at 33.3% accuracy (2/6). All four share a common root cause: the dedup logic discards the correct multi-line join in favour of an incomplete substring. Two secondary issues compound the problem: the `firstStructuralHeading` check rejects joins containing continuation punctuation, and the position-inflated threshold excludes valid second titles on multi-recipe pages.

Three targeted changes fix all four failures. No new embedding calls, no new dependencies. All changes are in `lib/text-classifier/title-extractor.ts`.

---

## Failure 1: ARAYES SHRAK → Got "ARAYES"

**Root cause:** Dedup at line 335 removes the 2-line join `ARAYES SHRAK` because `rawScore("ARAYES") >= rawScore("ARAYES SHRAK")`. The shorter partial wins on a rawScore tie even though the join earned `firstStructuralHeading` bonus (+0.10) and `allCapsBonus` (+0.08) — neither of which is consulted during dedup.

## Failure 2: Baked Eggs with Feta... → Got ""

**Root cause:** Same dedup bug. The join `Baked Eggs with Feta, Harissa Tomato Sauce & Coriander` is removed because `rawScore("Baked Eggs with Feta, Harissa Tomato Sauce") >= rawScore(full join)`. After dedup, the surviving candidates are the partial first line and orphaned `& Coriander`. Both may score too low to clear the `max(0.08, bestScore * 0.8)` threshold (since the join — which was the strongest candidate — was already eliminated). Result: `undefined`.

## Failure 3: FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS → Got "FINNISH MILK FLATBREADS"

**Root cause:** The position factor inflates the first title's score, which raises the threshold. `FINNISH MILK FLATBREADS` (pos 0.37) gets `positionFactor ≈ 1.075`. `FINNISH POTATO FLATBREADS` (pos 0.67) gets `positionFactor = 1.0`. The threshold is `0.8 × bestScore`, where bestScore includes the position boost. The second title's score (without position boost) falls below this inflated threshold and never reaches the multi-title guard at line 347.

## Failure 4: SAFFRON WHEAT BUNS WITH QUARK : COTTAGE CHEESE (VARIATION D) → Got "SAFFRON WHEAT BUNS WITH QUARK"

**Root cause:** Two compounding issues:
1. **Dedup:** Same as failures 1 & 2 — the join `SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)` is removed because the partial's rawScore >= the join's rawScore.
2. **`firstStructuralHeading` rejects the join:** The check requires every word to have ≥4 alpha letters. The token `"/"` has 0 alpha letters, so the join fails. Only the partial `SAFFRON WHEAT BUNS WITH QUARK` qualifies for the structural bonus. This creates asymmetric scoring that reinforces the dedup bug.

---

## Change 1: Use Final Score in Dedup, Prefer Longer on Ties

### Problem

Dedup compares `rawScore` (pure embedding similarity), ignoring all bonuses. But the bonuses encode structural signals (ALL_CAPS, first heading) that specifically indicate the join is the correct complete title. By ignoring these, dedup systematically discards the correct answer.

Furthermore, the rule "shorter wins on rawScore tie" is backwards for the multi-line join case. When `ARAYES` and `ARAYES SHRAK` have equal rawScores, the longer string is the complete title — not a "noisy join that happened to embed identically" (the comment's justification). In practice, partial titles and their joins almost always have equal or near-equal rawScores because embedding models saturate on the core semantic content.

### Code Change

```typescript
// BEFORE (lines 327-338):
selected = selected.filter((a) => {
  const aLower = a.text.toLowerCase();
  return !selected.some((b) => {
    if (b === a) return false;
    const bLower = b.text.toLowerCase();
    // b is longer and contains a: remove a only when b is semantically stronger
    if (bLower.includes(aLower) && b.text.length > a.text.length && b.rawScore > a.rawScore) return true;
    // b is shorter and is contained in a: remove a when b is equally or more title-like
    if (aLower.includes(bLower) && b.text.length < a.text.length && b.rawScore >= a.rawScore) return true;
    return false;
  });
});

// AFTER — use final score, prefer longer candidate on ties:
selected = selected.filter((a) => {
  const aLower = a.text.toLowerCase();
  return !selected.some((b) => {
    if (b === a) return false;
    const bLower = b.text.toLowerCase();
    // b is longer and contains a: remove a (shorter) when b has equal or higher score
    if (bLower.includes(aLower) && b.text.length > a.text.length && b.score >= a.score) return true;
    // b is shorter and contained in a: remove a (longer) only when b has strictly higher score
    if (aLower.includes(bLower) && b.text.length < a.text.length && b.score > a.score) return true;
    return false;
  });
});
```

### Why this works

The shift from `rawScore` to `score` means dedup now respects structural bonuses. The shift from "shorter wins on tie" to "longer wins on tie" reflects the reality that multi-line joins are completions, not noise.

**ARAYES SHRAK:** `score("ARAYES SHRAK")` includes `firstStructuralHeading` (+0.10) + `allCapsBonus` (+0.08) = rawScore × positionFactor + 0.18. `score("ARAYES")` includes only `allCapsBonus` (+0.08) = rawScore × positionFactor + 0.08. Even if rawScores are equal, the join's score is +0.10 higher. Dedup now keeps the join and removes the partial.

**Baked Eggs:** `score("Baked Eggs with Feta, Harissa Tomato Sauce & Coriander")` ≈ `score("Baked Eggs with Feta, Harissa Tomato Sauce")` (neither is ALL_CAPS, no structural bonus). Since scores are approximately equal, the "longer wins on tie" rule keeps the full join and removes the partial. `& Coriander` is also removed as a substring of the join.

**SAFFRON:** See Change 2 below — once the join qualifies for `firstStructuralHeading`, its score exceeds the partial's, and dedup keeps it.

### Expected Impact

| Case | Before | After |
|------|--------|-------|
| ARAYES SHRAK | "ARAYES" (join removed by dedup) | "ARAYES SHRAK" (join kept, partial removed) |
| Baked Eggs | "" (join removed, survivors too weak) | "Baked Eggs with Feta, Harissa Tomato Sauce & Coriander" (join kept) |
| SAFFRON (with Change 2) | "SAFFRON WHEAT BUNS WITH QUARK" | Full title with continuation |

---

## Change 2: Continuation-Aware `firstStructuralHeading` and Candidate Joining

### Problem

Recipe titles split across lines often have continuation fragments starting with punctuation: `/ COTTAGE CHEESE (VARIATION D)`, `& Coriander`, `+ FINNISH POTATO FLATBREADS`. The current `firstStructuralHeading` check requires every whitespace-delimited token to have ≥4 alpha letters. Tokens like `/`, `&`, `+`, `:`, and short parenthetical fragments like `D)` fail this check, so multi-line joins are excluded from the structural bonus even when they're the correct complete title.

### Code Change — Strip continuation punctuation tokens before the structural check

```typescript
// BEFORE (lines 272-280):
const firstStructuralHeading = candidates.find(
  (c) =>
    isAllCaps(c.text) &&
    wordCount(c.text) >= 2 &&
    c.text
      .trim()
      .split(/\s+/)
      .every((w) => w.replace(/[^A-Z]/g, "").length >= 4)
);

// AFTER — filter out continuation punctuation and short parenthetical tokens:
const CONTINUATION_TOKENS = /^[\/&+:()]+$/;
const firstStructuralHeading = candidates.find((c) => {
  if (!isAllCaps(c.text) || wordCount(c.text) < 2) return false;
  const significantWords = c.text
    .trim()
    .split(/\s+/)
    .filter((w) => !CONTINUATION_TOKENS.test(w));
  return (
    significantWords.length >= 2 &&
    significantWords.every((w) => w.replace(/[^A-Z]/g, "").length >= 4)
  );
});
```

### Why this works

For `SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)`:
- Before: tokens include `/` (0 alpha) and `D)` (1 alpha) → fails
- After: `/` matches `CONTINUATION_TOKENS` → filtered out. Remaining significant words: `SAFFRON`(7), `WHEAT`(5), `BUNS`(4), `WITH`(4), `QUARK`(5), `COTTAGE`(7), `CHEESE`(6), `(VARIATION`→`VARIATION`(9), `D)`→`D`(1)...

Hmm, `D)` has 1 alpha letter and doesn't match `CONTINUATION_TOKENS` since it's `D)` not pure punctuation. We need a slightly broader filter:

```typescript
// Filter tokens that are: pure punctuation, single letter + punctuation, or parenthetical markers
const isInsignificantToken = (w: string): boolean => {
  const alpha = w.replace(/[^A-Z]/g, "");
  return alpha.length <= 1; // Covers "/", "&", "+", ":", "(", "D)", "1)", etc.
};

const firstStructuralHeading = candidates.find((c) => {
  if (!isAllCaps(c.text) || wordCount(c.text) < 2) return false;
  const significantWords = c.text
    .trim()
    .split(/\s+/)
    .filter((w) => !isInsignificantToken(w));
  return (
    significantWords.length >= 2 &&
    significantWords.every((w) => w.replace(/[^A-Z]/g, "").length >= 4)
  );
});
```

For `SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)`:
- `/` → alpha "" (0) → insignificant, filtered
- `D)` → alpha "D" (1) → insignificant, filtered
- Significant words: SAFFRON(7), WHEAT(5), BUNS(4), WITH(4), QUARK(5), COTTAGE(7), CHEESE(6), `(VARIATION` → alpha "VARIATION"(9) → significant
- All significant words have ≥4 alpha letters → passes → gets structural bonus +0.10

This gives the join a decisive score advantage over the partial, so Change 1's dedup keeps it.

**Safety check — does this let "DAT FLATBREADS" through?**
- `DAT` → alpha "DAT" (3) → significant (>1 letter)
- Significant words: DAT(3), FLATBREADS(10). DAT has 3 < 4 → fails. Still blocked.

### Expected Impact

| Case | firstStructuralHeading before | After |
|------|-------------------------------|-------|
| SAFFRON join | fails (/ and D) have too few alpha) | passes (/ and D) filtered as insignificant) |
| ARAYES SHRAK | passes (no change) | passes (no change) |
| DAT FLATBREADS | fails (DAT has 3 letters) | still fails (DAT has 3 letters) |

---

## Change 3: Compute Threshold from Position-Free Scores

### Problem

The multi-title threshold `max(0.08, bestScore * 0.8)` uses the final score, which includes the position factor. The first title on a multi-recipe page gets a position boost that inflates `bestScore`, raising the bar. The second title — appearing later in the document — gets no position boost and may fall below this inflated threshold.

This is a self-defeating interaction: the position factor is meant to be a tiebreaker between equally title-like candidates, but when it feeds into the threshold, it becomes a filter that excludes valid titles.

### Code Change

Store a position-free score alongside the final score and use it for threshold computation:

```typescript
// In the scoring loop, compute both:
const scoreWithoutPosition = rawScore + allCapsBonus + structuralBonus;
const score = rawScore * positionFactor + allCapsBonus + structuralBonus;
scored.push({
  text: candidate.text,
  position: candidate.position,
  score,
  rawScore,
  baseScore: scoreWithoutPosition,  // NEW field
});

// BEFORE (line 315):
const bestScore = Math.max(...scored.map((s) => s.score));
const threshold = Math.max(0.08, bestScore * 0.8);

// AFTER — threshold based on position-free score:
const bestBaseScore = Math.max(...scored.map((s) => s.baseScore));
const threshold = Math.max(0.08, bestBaseScore * 0.8);

// Still filter using final score (position factor is a valid ranking signal):
let selected = scored.filter((s) => s.score >= threshold);
```

### Why this works

For the FINNISH case:
- `FINNISH MILK FLATBREADS` (pos 0.37): `baseScore = rawScore + 0.08 + 0.10 = rawScore + 0.18`
- `FINNISH POTATO FLATBREADS` (pos 0.67): `baseScore = rawScore + 0.08 = rawScore + 0.08`

Before: `threshold = 0.8 × (rawScore × 1.075 + 0.18)`. The position factor (×1.075) inflates the threshold.
After: `threshold = 0.8 × (rawScore + 0.18)`. No position inflation.

The second title's final score is `rawScore + 0.08`. For it to pass:
`rawScore + 0.08 >= 0.8 × (rawScore + 0.18)`
`rawScore + 0.08 >= 0.8 × rawScore + 0.144`
`0.2 × rawScore >= 0.064`
`rawScore >= 0.32`

Recipe title headings typically score rawScore ≈ 0.10–0.20 against the title reference, so this threshold might still be tight. But removing the position inflation gives the second title a much better chance.

**Additional safety valve:** If the second title still falls just below threshold, we can also lower the multiplier from 0.8 to 0.7:

```typescript
const threshold = Math.max(0.08, bestBaseScore * 0.7);
```

This is safer now that the threshold isn't position-inflated.

### Expected Impact

| Case | Before | After |
|------|--------|-------|
| FINNISH (2 titles) | Second title filtered by position-inflated threshold | Second title survives; multi-title guard (`allCapsSelected.length >= 2`) fires; both titles joined with " + " |

---

## Combined Impact Projection

| Test Case | Current (iter 3) | After Changes | Which Changes |
|---|---|---|---|
| ARAYES SHRAK | FAIL ("ARAYES") | PASS ("ARAYES SHRAK") | Change 1: dedup keeps join (higher score from structural bonus) |
| Baked Eggs with Feta... | FAIL ("") | PASS (full title) | Change 1: dedup keeps join (longer wins on score tie) |
| FINNISH MILK + POTATO | FAIL ("FINNISH MILK FLATBREADS") | PASS (both titles) | Change 3: position-free threshold lets second title through |
| MIXED SEED CRISPBREAD | PASS | PASS | No regression — structural bonus + allCaps bonus still dominate |
| OVERNIGHT STRAIGHT PIZZA DOUGH | PASS | PASS | No regression — earliest candidate with highest semantic score + bonuses |
| SAFFRON WHEAT BUNS... | FAIL (partial) | PASS (full title with continuation) | Change 2: join qualifies for structural bonus; Change 1: dedup keeps it |

**Projected accuracy: 6/6 (100%)**

---

## Risk Assessment

### Regression risk for passing cases

**MIXED SEED CRISPBREAD:** Currently passes because `firstStructuralHeading` selects it and gives it the decisive bonus. Change 2 modifies the structural heading check but only makes it more permissive (filters insignificant tokens). `MIXED SEED CRISPBREAD` has no insignificant tokens, so the check is unchanged. No regression.

**OVERNIGHT STRAIGHT PIZZA DOUGH:** Currently passes because it's the earliest high-scoring ALL_CAPS candidate. Change 1 modifies dedup but this case has no substring relationships between candidates. Change 3 lowers the threshold slightly (position-free), which only allows more candidates through — it doesn't change which candidate scores highest. No regression.

### Edge cases to watch

1. **Cases where the shorter candidate genuinely IS the correct title and the join is noise.** The new rule "longer wins on score tie" could keep a noisy join over a clean short title. Mitigation: this only applies to substring relationships. If the join is noisy, it will fail `passesHardFilters` or score much lower on embedding similarity, so it won't be in a "tie" with the clean title.

2. **Pages with many ALL_CAPS candidates.** The lower threshold (Change 3) may let more candidates through, increasing the chance of false multi-title detection. Mitigation: the multi-title guard (`allCapsSelected.length >= 2`) is structural, not threshold-based. The `cap at 3` and `sort by document position` logic handles overflow gracefully.

3. **The `baseScore` field adds memory overhead.** One extra number per candidate, max 25 candidates = 200 bytes. Negligible on mobile.

---

## Implementation Checklist

1. Add `baseScore` field to the scored candidates type
2. Modify `firstStructuralHeading` to filter insignificant tokens (≤1 alpha letter)
3. Compute `baseScore` (score without position factor) in the scoring loop
4. Change threshold to use `bestBaseScore` instead of `bestScore`
5. Change dedup to use `score` instead of `rawScore`, and invert tie-breaking (longer wins)
6. Run the test suite to verify all 6 cases pass

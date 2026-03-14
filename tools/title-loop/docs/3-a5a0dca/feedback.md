# Title Extractor Failure Analysis — Iteration 3

## Failures Summary

| File | Expected | Got |
|------|----------|-----|
| ARAYES SHRAK | `ARAYES SHRAK` | `ARAYES` |
| Baked Eggs with Feta… | `Baked Eggs with Feta, Harissa Tomato Sauce & Coriander` | `` |
| FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS | `FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS` | `FINNISH MILK FLATBREADS` |
| SAFFRON WHEAT BUNS WITH QUARK : COTTAGE CHEESE (VARIATION D) | `SAFFRON WHEAT BUNS WITH QUARK : COTTAGE CHEESE (VARIATION D)` | `SAFFRON WHEAT BUNS WITH QUARK` |

---

## Pattern 1: Substring deduplication removes the correct multi-line join

**Affects: ARAYES SHRAK, SAFFRON WHEAT BUNS, Baked Eggs**

### The bug

The dedup rule at line 335 reads:

```ts
// b is shorter and is contained in a: remove a when b is equally or more title-like
if (aLower.includes(bLower) && b.text.length < a.text.length && b.rawScore >= a.rawScore) return true;
```

This fires whenever a shorter candidate is a substring of a longer one and the shorter candidate's rawScore is ≥ the longer. The intention is to drop a bloated join when the clean short title is already captured. In practice it does the opposite: it removes the *complete* title (the multi-line join) in favour of a *partial* first line, because partial titles almost always score ≥ the full join in embedding space.

### Why partial scores ≥ full join

The embedding model measures semantic similarity to "recipe name, dish title…". A partial title like `ARAYES` or `SAFFRON WHEAT BUNS WITH QUARK` already carries the full semantic signal of a recipe title. Adding `SHRAK` or `/ COTTAGE CHEESE (VARIATION D)` does not increase title-similarity — it may even dilute it slightly by introducing unfamiliar tokens. So rawScore(partial) ≥ rawScore(join) is the common case, not an edge case.

### Per-file breakdown

**ARAYES SHRAK**
The OCR split the title onto two lines:
```
ARAYES        ← line 1
SHRAK         ← line 2
```
`buildCandidates` correctly builds the 2-line join `ARAYES SHRAK`, which qualifies as the `firstStructuralHeading` (+0.10 structural bonus, +0.08 ALL_CAPS bonus). However, dedup runs on `rawScore` only, ignoring bonuses. Since `rawScore("ARAYES") ≥ rawScore("ARAYES SHRAK")`, the join is discarded and `ARAYES` alone is returned.

**SAFFRON WHEAT BUNS WITH QUARK : COTTAGE CHEESE (VARIATION D)**
The OCR split the title onto two lines:
```
SAFFRON WHEAT BUNS WITH QUARK       ← line 54
/ COTTAGE CHEESE (VARIATION D)      ← line 55
```
`SAFFRON WHEAT BUNS WITH QUARK` qualifies as `firstStructuralHeading` (every word has ≥4 alpha letters; the `firstStructuralHeading` check excludes the `/` line). The 2-line join `SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)` does NOT qualify as `firstStructuralHeading` because `/` has 0 alpha letters, failing the `every word ≥4 letters` guard. So the join receives +0.08 ALL_CAPS bonus only, while the partial receives +0.18. The dedup then removes the join (rawScore of partial ≥ rawScore of join), and the partial wins by its structural bonus — which was never a fair contest because the join was penalised before dedup even ran.

**Baked Eggs with Feta, Harissa Tomato Sauce & Coriander**
The OCR split the title onto two lines:
```
Baked Eggs with Feta, Harissa Tomato Sauce   ← line 1
& Coriander                                  ← line 2
```
The 2-line join passes all hard filters (54 chars, no measurements, no garbling). Dedup removes it because `rawScore("Baked Eggs with Feta, Harissa Tomato Sauce") ≥ rawScore(full join)`. The remaining candidates are the partial first line and `& Coriander` as an isolated fragment. `& Coriander` alone has very low title-similarity (a connector fragment starting with `&` scores poorly against the title reference). After threshold filtering, it is likely dropped. The result depends on whether the partial line alone clears the `max(0.08, bestScore * 0.8)` threshold; if it doesn't — because the file has few candidates and the best score is low — the function returns `undefined`, explaining the empty string output. This is the most severe failure: no title extracted at all.

---

## Pattern 2: Second recipe title falls below threshold on multi-recipe pages

**Affects: FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS**

The file contains two distinct recipes on the same page. Both headings are present:

```
FINNISH MILK FLATBREADS       ← line 16 (of 43)
FINNISH POTATO FLATBREADS     ← line 29 (of 43)
```

Both pass `passesHardFilters`. Both are ALL_CAPS with ≥2 words of ≥4 letters, so `allCapsSelected.length >= 2` should fire and keep both.

The failure is that `FINNISH POTATO FLATBREADS` does not appear in `selected` at the scoring stage. The likely cause is the threshold: `Math.max(0.08, bestScore * 0.8)`.

- `FINNISH MILK FLATBREADS` is at relative position ~0.37 → positionFactor ≈ 1.075 (boost applied).
- `FINNISH POTATO FLATBREADS` is at relative position ~0.67 → positionFactor = 1.0 (no boost, position > 0.5).

If `FINNISH MILK FLATBREADS` is the highest-scoring candidate, the threshold is set at `0.8 × its score`. Any candidate whose rawScore is slightly lower (including a second ALL_CAPS heading of comparable but not identical quality) may fall below this threshold and never reach the multi-title guard.

The position factor creates an asymmetry: it boosts the first title's final score, raising the threshold, which then excludes the later title. This is a self-defeating interaction — the position bonus intended to prefer early titles inadvertently raises the bar high enough to exclude valid second titles.

---

## Common Themes

1. **The dedup logic is inverted for multi-line joins.** The rule "shorter substring wins on equal rawScore" was designed to clean up redundant joins, but it systematically destroys the *correct* complete title when a partial title is equally title-like in embedding space. Practically all real-world split titles are affected. The fix needs to account for the case where the longer candidate is the structurally correct result (i.e. it received a bonus for a reason).

2. **Continuation fragments starting with punctuation (`&`, `/`, `+`) break multi-line joining.** These fragments individually score near-zero for title similarity. When the dedup removes the joined candidate, nothing reassembles the full title. The algorithm has no mechanism to recognise that `& Coriander` and `/ COTTAGE CHEESE (VARIATION D)` are continuations rather than standalone candidates.

3. **`firstStructuralHeading` bonus is computed before dedup, but dedup ignores it.** For ARAYES SHRAK and SAFFRON WHEAT BUNS, the join earns or should earn the structural bonus — yet dedup discards it using rawScore alone. The bonus signals that the join is the correct title, but that signal is never consulted during deduplication.

4. **The position-factor × threshold interaction punishes late-appearing titles.** On multi-recipe pages, the first heading earns a position bonus that raises the threshold, making it harder for subsequent headings to survive. The multi-title guard (`allCapsSelected.length >= 2`) is correct in intent but never gets to fire because the second candidate is eliminated upstream at the threshold step.

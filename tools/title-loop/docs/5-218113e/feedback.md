# Iteration 5 Failure Analysis

## Failures

### 1. `Baked Eggs with Feta, Harissa Tomato Sauce & Coriander` → `''`

**What happened:** Nothing was returned.

**Why:** The title is split across two lines:
```
Baked Eggs with Feta, Harissa Tomato Sauce    ← line 1
& Coriander                                    ← line 2
```

The 2-line join (`Baked Eggs with Feta, Harissa Tomato Sauce & Coriander`, 54 chars) passes hard filters. But the deduplication step removes it: the shorter single line `Baked Eggs with Feta, Harissa Tomato Sauce` is a substring of the join, so the join is discarded in favor of the partial line. After dedup only the partial survives — but it may not pass the threshold (no ALL_CAPS bonus, no structural bonus, mixed-case title).

The deeper issue is that `& Coriander` is also a candidate (passes hard filters), and the dedup logic's "shorter wins" rule is designed to prevent ingredient run-ons but here it actively destroys the correct multi-line title join.

If the partial single line does score above threshold, the output would be `Baked Eggs with Feta, Harissa Tomato Sauce` — not an exact match to expected — but the run reports `''`, suggesting either the partial also fails threshold, or something else causes all candidates to be filtered.

**Root cause:** Split mixed-case title + deduplication's "shorter wins" rule destroys the 2-line join that is the correct answer.

---

### 2. `FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS` → `FINNISH MILK FLATBREADS`

**What happened:** Only the first title was returned; the second was dropped.

**Why:** Both titles appear as clean standalone ALL_CAPS lines well within the document (lines 16 and 29 of 43). The algorithm should recognize both as a multi-recipe page.

Tracing through:
- `baseHeading` = `FINNISH MILK FLATBREADS` (first structural heading, passes `isStructuralHeading` — all three sig words ≥ 4 letters).
- `firstStructuralHeading` = `FINNISH MILK FLATBREADS` (no continuation extension found — `FINNISH POTATO FLATBREADS` doesn't start with `"finnish milk flatbreads "`).
- `FINNISH MILK FLATBREADS` receives `allCapsBonus (0.08) + structuralBonus (0.10) = 0.18` in total on top of its raw embedding score.

The structural bonus inflates `bestBaseScore`, which raises the threshold via `bestBaseScore × 0.7`. `FINNISH POTATO FLATBREADS` has only `allCapsBonus (0.08)` and receives no position boost (it appears at ~65% of the document, past the 50% cutoff). Its total score falls below the inflated threshold.

The multi-title guard (`allCapsSelected.length >= 2 → keep both`) never fires because `FINNISH POTATO FLATBREADS` is already filtered out before that point.

**Root cause:** Structural heading bonus on the first title inflates `bestBaseScore`, raising the threshold so high that the second title — with identical ALL_CAPS quality but no structural bonus — fails to pass it.

---

### 3. `SAFFRON WHEAT BUNS WITH QUARK : COTTAGE CHEESE (VARIATION D)` → `FRON WHEAT BUNS (VARIATION 1)`

**What happened:** A completely wrong, garbled OCR artifact was returned instead of the real title.

**Why:** The page contains an earlier OCR corruption near line 29:
```
FRON WHEAT BUNS (VARIATION 1)
```
This is a truncated rendering of `SAFFRON WHEAT BUNS` with a garbled variation number. Despite being a junk artifact, it passes `isStructuralHeading`:
- All letters uppercase ✓
- sig words: `FRON`(4), `WHEAT`(5), `BUNS`(4), `(VARIATION`(9) — all ≥ 4 letters ✓

So `baseHeading = "FRON WHEAT BUNS (VARIATION 1)"` and it receives the full `structuralBonus (0.10) + allCapsBonus (0.08) = 0.18`.

The correct title appears later (lines 54–55):
```
SAFFRON WHEAT BUNS WITH QUARK
/ COTTAGE CHEESE (VARIATION D)
```

The continuation extension logic was designed for exactly this pattern, but it only fires when `baseHeading` IS the correct title's first line — checking whether any candidate starts with `baseHeading.text + " "` followed by a continuation char. Since `baseHeading` is the wrong garbled line, the continuation logic never triggers for the real title.

The 2-line join `SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)` passes hard filters and would be the correct answer. But:
1. The garbled `FRON WHEAT BUNS (VARIATION 1)` inflates `bestBaseScore` with its structural bonus, raising the threshold.
2. The deduplication removes the join in favor of the shorter `SAFFRON WHEAT BUNS WITH QUARK` (which is a substring of the join).
3. `SAFFRON WHEAT BUNS WITH QUARK` (no structural bonus, no position boost at 70% document depth) likely falls just below the inflated threshold.

Result: only the garbled candidate survives.

**Root cause:** A garbled ALL_CAPS OCR fragment passes `isStructuralHeading` and hijacks the structural heading role. This awards `firstStructuralHeading` to the wrong candidate, disables the continuation extension for the real title, and inflates the threshold so the real title is excluded.

---

## Common Themes

### Theme 1: Structural bonus inflates threshold, excluding correct titles (cases 2 and 3)

The comment at line 328 notes that `baseScore` (without position factor) is used for the threshold so that position boost doesn't inflate the bar. But `baseScore` still includes `allCapsBonus` and `structuralBonus`. The structural bonus (+0.10) is large enough that `bestBaseScore × 0.7` rises above what a correct ALL_CAPS title without the structural bonus can achieve. The fix attempted for position leakage was not applied to bonus leakage.

### Theme 2: "Shorter wins" deduplication destroys multi-line title joins (cases 1 and 3)

The dedup rule removes a candidate `a` if any shorter candidate `b` is a substring of it. This correctly prevents ingredient run-ons, but it also destroys 2-line title joins: the first half of the title (a shorter candidate) causes the complete join to be eliminated. The join is the only correct answer on split-title pages.

### Theme 3: `isStructuralHeading` accepts garbled OCR fragments (case 3)

The check requires ALL_CAPS, ≥2 sig words, and each sig word ≥4 uppercase letters. This is satisfied by truncated OCR artifacts like `FRON WHEAT BUNS (VARIATION 1)`. There is no check that the candidate is semantically plausible as a recipe title before awarding it the structural bonus and the `firstStructuralHeading` role.

### Theme 4: Mixed-case titles receive no bonuses and may fall below the floor threshold (case 1)

Titles like `Baked Eggs with Feta, Harissa Tomato Sauce & Coriander` get no `allCapsBonus` and no `structuralBonus`. With a floor threshold of `0.08`, a plausible recipe title that scores moderately in embeddings may still be filtered out — especially if any ALL_CAPS candidate (even a bad one) drives up `bestBaseScore`.

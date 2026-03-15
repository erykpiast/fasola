# Title Extraction Failures — Iteration 7 Analysis

## Failure 1: Baked Eggs with Feta, Harissa Tomato Sauce & Coriander

**Input structure:**
```
Line 1: "Baked Eggs with Feta, Harissa Tomato Sauce"
Line 2: "& Coriander"
Line 3: (long body paragraph)
Line 4: "SERVES *"
```

**Why it fails:**

The title is split across two lines with a continuation character ("&") on the second line. The 2-line join "Baked Eggs with Feta, Harissa Tomato Sauce & Coriander" (54 chars) is a valid candidate and passes `passesHardFilters`. However, the 2-line join's embedding score is likely lower than the single-line prefix because embedding models tend to score the semantically complete-looking fragment ("Baked Eggs with Feta, Harissa Tomato Sauce") more confidently as a recipe title than the joined string (which includes the dangling "& Coriander" fragment).

If the join is below the threshold while the single-line prefix is above it, then `survivingJoins` is empty after threshold filtering. This means the continuation-prefix-protection logic does **not** fire. The single "Baked Eggs with Feta, Harissa Tomato Sauce" survives as the only candidate. The dedup step would also eliminate the join if it somehow survived (it's a superstring of the single, and "shorter wins"). Result: the truncated prefix is returned, missing "& Coriander".

Additionally, "& Coriander" itself passes `passesHardFilters` as a standalone candidate (it doesn't start lowercase, has sufficient vowel ratio, and isn't caught by `hasGarbledWord`). This introduces noise in the candidate pool.

---

## Failure 2: CHLEBEK Z WARZYWAMI I BOCZKIEM

**Input structure:**
```
Line 1: "Lato | Dania główne"      ← category header (Polish: "Summer | Main courses")
Line 2: "CHLEBEK Z WARZYWAMI I BOCZKIEM"  ← recipe title
Line 3: "WARZYWA I BOCZEK"         ← section sub-header within recipe
```

**Why it fails:**

Both "CHLEBEK Z WARZYWAMI I BOCZKIEM" and "WARZYWA I BOCZEK" pass `isStructuralHeading`:

- "CHLEBEK Z WARZYWAMI I BOCZKIEM": sigWords = ["CHLEBEK"(7), "WARZYWAMI"(9), "BOCZKIEM"(8)]. All ≥ 4. ✓
- "WARZYWA I BOCZEK": sigWords = ["WARZYWA"(7), "BOCZEK"(6)]; "I" filtered (1 letter). Both ≥ 4. ✓

Both are ALL_CAPS and likely pass the embedding threshold (Polish food nouns embed well against the title reference). The multi-title guard at the end then detects `allCapsSelected.length >= 2` and returns **both**, producing "CHLEBEK Z WARZYWAMI I BOCZKIEM + WARZYWA I BOCZEK" instead of just the recipe title.

The algorithm cannot distinguish a sub-section header ("WARZYWA I BOCZEK" = "Vegetables and Bacon") that appears within the body of a single recipe from a second recipe title. Both look identical structurally.

A further complication: the 2-line join "CHLEBEK Z WARZYWAMI I BOCZKIEM WARZYWA I BOCZEK" also qualifies as a structural heading and may appear in candidates, compounding the multi-heading confusion.

---

## Failure 3: Faszerowana papryka

**Input structure:**
```
Line 1: "Faszerowana papryka"     ← Polish title ("Stuffed peppers"), mixed case
Line 2: "PAPRIKA GYERAN-JJIM"    ← Korean dish name romanized, ALL_CAPS
Line 3: "파프리카 계란찜"          ← Korean script (isLikelyGarbled → no latin letters)
Line 4: "Ten bardzo prosty..."    ← body text, starts lowercase → filtered
```

**Why it fails:**

"PAPRIKA GYERAN-JJIM" qualifies as a structural heading:
- isAllCaps = true
- sigWords = ["PAPRIKA"(7), "GYERANJJIM"(10)]. Both ≥ 4. ✓

It receives `allCapsBonus` (0.08) + `structuralBonus` (0.10) = **+0.18** total.

"Faszerowana papryka" is a plain mixed-case line at position 0. It receives no bonuses. Even with the positional factor (`1.0 + 0.12 * 1.0 = 1.12` multiplier for position 0), this is unlikely to overcome +0.18 in additive bonuses on top of "PAPRIKA GYERAN-JJIM"'s own rawScore.

The multi-title guard then sees exactly one ALL_CAPS candidate, collapses `selected` to the highest-scoring candidate, and returns "PAPRIKA GYERAN-JJIM".

The algorithm misidentifies the Korean romanization (a subtitle/transliteration of the title) as the recipe title because it's ALL_CAPS. The actual Polish title, which appears first and is the canonical recipe name for this cookbook, is discarded.

---

## Failure 4: SAFFRON WHEAT BUNS WITH QUARK : COTTAGE CHEESE (VARIATION D)

**Input structure:**
```
Lines 1–28:  Heavily garbled OCR text (previous recipe page bleeds, partial words)
Line 29:     "FRON WHEAT BUNS (VARIATION 1)"  ← truncated OCR of prior recipe heading
...
Line 54:     "SAFFRON WHEAT BUNS WITH QUARK"
Line 55:     "/ COTTAGE CHEESE (VARIATION D)"
```

**Why it fails (two independent issues):**

**Issue A — OCR character mismatch:**
The expected output uses `":"` as separator ("QUARK : COTTAGE CHEESE"), but the OCR text on line 55 reads `"/ COTTAGE CHEESE (VARIATION D)"` with a slash. The algorithm can only produce text present in the input. Even if the continuation join logic works correctly, the best possible output from this OCR text is "SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)", which does not match the expected ground truth. The "/" in the OCR is a misread colon from the original print.

**Issue B — Candidate pre-filter may exclude the 2-line join:**
The top-25 pre-filter in `buildCandidates` sorts candidates by ALL_CAPS first, then by word count ≤ 5. The single "SAFFRON WHEAT BUNS WITH QUARK" (5 words, ALL_CAPS) scores higher priority than the 2-line join "SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)" (9 words, ALL_CAPS). If the total candidate count exceeds 25 (likely given ~45 non-empty lines after the garbled burst), the longer join may be cut. If the join is absent from `rawScored`, the `firstStructuralHeading` continuation logic falls back to `baseHeading` (the single), returning the incomplete title.

The truncation-detection penalty for "FRON WHEAT BUNS (VARIATION 1)" → "SAFFRON WHEAT BUNS WITH QUARK" is correctly implemented and should work. That is not the cause of failure here.

---

## Common Themes

### 1. Continuation joins are fragile
Cases 1 and 4 both involve a title split across two lines where the continuation line starts with a symbol ("&", "/"). The continuation-protection logic is conditional on the join surviving the threshold (case 1) and on the join being present in the candidate pool at all (case 4). These preconditions silently fail, and the algorithm returns the first half of the title with no indication that anything is wrong.

### 2. Intra-recipe ALL_CAPS section headers defeat the multi-title guard
Case 2 shows that the multi-title guard (`allCapsSelected.length >= 2 → return all`) cannot distinguish a recipe's sub-section heading from a second recipe title on a multi-recipe page. In single-recipe layouts, ALL_CAPS headers like "WARZYWA I BOCZEK" (ingredients section) or "PRZYGOTOWANIE" (preparation) trigger the same structural heading logic as recipe titles.

### 3. ALL_CAPS bonuses override document position for bilingual pages
Case 3 demonstrates that the structural (+0.10) and ALL_CAPS (+0.08) bonuses are large enough to override a first-position mixed-case title when an ALL_CAPS subtitle/romanization appears on line 2. The algorithm has no mechanism to prefer a mixed-case title on line 1 over an ALL_CAPS romanization on line 2 when only one ALL_CAPS candidate survives threshold.

### 4. Ground truth / OCR separator mismatch
Case 4 reveals a category of failure where the OCR misreads a character (colon → slash) such that the correct string is not present anywhere in the input. No algorithmic change can fix this — it requires either correcting the expected value or normalising separators post-extraction.

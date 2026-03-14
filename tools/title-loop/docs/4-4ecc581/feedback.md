# Title Extraction Failure Analysis — Iteration 4 (4ecc581)

## Failure 1: Baked Eggs with Feta, Harissa Tomato Sauce & Coriander

**Expected:** `Baked Eggs with Feta, Harissa Tomato Sauce & Coriander`
**Got:** `''`

### What the input looks like
```
Baked Eggs with Feta, Harissa Tomato Sauce
& Coriander
Baked eggs is one of my all-time favourite breakfast dishes. ...
SERVES *
4 tbsp olive oil
...
```

### Why it failed

`buildCandidates` generates three relevant candidates:
1. `"Baked Eggs with Feta, Harissa Tomato Sauce"` (line 1, single)
2. `"& Coriander"` (line 2, single)
3. `"Baked Eggs with Feta, Harissa Tomato Sauce & Coriander"` (lines 1+2, 2-line join)

The 2-line join — the correct complete title — is **removed by the dedup "shorter wins" filter** (lines 359–367). The filter sees that `"baked eggs with feta, harissa tomato sauce"` is both a substring of the join AND shorter, so the join is eliminated in favour of the first-line fragment.

After dedup, only the incomplete fragment `"Baked Eggs with Feta, Harissa Tomato Sauce"` and the confusing dangling `"& Coriander"` survive. The `Got: ''` result most likely means the algorithm returned `undefined` (shown as `''` by the test harness) — possibly because neither remaining candidate scored above threshold, or `"& Coriander"` alone caused the multi-title guard to produce a nonsensical result.

### Root cause

The "shorter wins" dedup rule was designed for cases like `"Pierogi Ruskie 200g mąki …"` → keep `"Pierogi Ruskie"`. But when **the first line of a split title is itself a syntactically valid title fragment**, that fragment qualifies as the "shorter winner" and destroys the complete multi-line join. The algorithm has no way to distinguish between:
- a complete title that is a prefix of a longer noise string (correct to prefer shorter)
- the first half of a split title that happens to be a valid fragment (wrong to prefer shorter)

---

## Failure 2: FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS

**Expected:** `FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS`
**Got:** `FINNISH MILK FLATBREADS`

### What the input looks like
```
[heavily garbled OCR from previous page — lines 1–15]
FINNISH MILK FLATBREADS          ← line 16
Maitorieska (Finland)
... full recipe body (~12 lines) ...
FINNISH POTATO FLATBREADS        ← line 29
Perunarieska (Finland)
... full recipe body ...
```

### Why it failed

`isStructuralHeading` correctly identifies both `FINNISH MILK FLATBREADS` and `FINNISH POTATO FLATBREADS`. The `firstStructuralHeading` continuation check (lines 285–292) correctly does NOT merge them (since `"finnish potato flatbreads"` does not start with `"finnish milk flatbreads "` followed by a continuation character — they are separate titles).

Both should survive to the multi-title guard. However, scoring differs significantly:

| Candidate | structuralBonus | positionFactor | Effect |
|---|---|---|---|
| FINNISH MILK FLATBREADS | +0.10 (is firstStructuralHeading) | up to +0.12 (early in doc) | High baseScore |
| FINNISH POTATO FLATBREADS | 0.00 | 1.0 (late in doc) | Lower baseScore |

The threshold is `max(0.08, bestBaseScore * 0.7)`. Because `FINNISH MILK FLATBREADS` receives both the structural bonus and the position factor, its `bestBaseScore` is elevated. `FINNISH POTATO FLATBREADS` — without either bonus — likely falls just below `bestBaseScore * 0.7` and is **filtered out at the threshold step** before the multi-title guard even runs.

### Root cause

The `structuralBonus` of +0.10 is awarded exclusively to `firstStructuralHeading` (line 316). On multi-recipe pages, the second recipe title gets no structural bonus, no position boost (it's later in the document), and is therefore penalised by the threshold raised by the first title's inflated score. The algorithm was designed for single-recipe pages where the first structural heading is the answer; it inadvertently suppresses valid second titles.

---

## Failure 3: SAFFRON WHEAT BUNS WITH QUARK : COTTAGE CHEESE (VARIATION D)

**Expected:** `SAFFRON WHEAT BUNS WITH QUARK : COTTAGE CHEESE (VARIATION D)`
**Got:** `FRON WHEAT BUNS (VARIATION 1)`

### What the input looks like
```
BUNS                                     ← line 1
ssekart                                  ← line 2
... garbled lines ...
FRON WHEAT BUNS (VARIATION 1)           ← line 29 — OCR fragment from *previous* recipe
eden)
... recipe body ...
SAFFRON WHEAT BUNS WITH QUARK           ← line 54 — actual title, line 1
/ COTTAGE CHEESE (VARIATION D)          ← line 55 — actual title, line 2
trutter med kesells / kurg (Sweden)
...
```

### Why it failed

**Step 1 — wrong base heading selected.**
`isStructuralHeading` passes on `"FRON WHEAT BUNS (VARIATION 1)"`:
- ALL_CAPS ✓
- sigWords (>1 uppercase alpha letter): `FRON`(4), `WHEAT`(5), `BUNS`(4), `VARIATION`(9) — each ≥ 4 ✓

This OCR garbage fragment from the *previous* recipe (the correct heading was `SAFFRON WHEAT BUNS` but OCR dropped the `SAF`) becomes `baseHeading`. It wins because it appears earlier in the document (line 29 vs. line 54).

**Step 2 — continuation logic misfires.**
The continuation check (lines 285–292) looks for a candidate whose lowercased text starts with `"fron wheat buns (variation 1) "` followed by a continuation character. No such candidate exists, so `firstStructuralHeading = "FRON WHEAT BUNS (VARIATION 1)"`. This gets the +0.10 structural bonus.

**Step 3 — correct join is deduped away.**
`buildCandidates` generates the 2-line join `"SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)"`. The dedup filter removes it because `"SAFFRON WHEAT BUNS WITH QUARK"` alone is both a substring of the join and shorter. The correct complete title is eliminated; only the partial `"SAFFRON WHEAT BUNS WITH QUARK"` survives.

**Step 4 — wrong candidate wins on score.**
`"FRON WHEAT BUNS (VARIATION 1)"` gets:
- structuralBonus +0.10 (is `firstStructuralHeading`)
- position bonus (appears at ~38% of the document, positionFactor > 1)

`"SAFFRON WHEAT BUNS WITH QUARK"` gets neither. Its rawScore must exceed `"FRON WHEAT BUNS (VARIATION 1)"`'s total score by more than 0.10 to win — it does not. The garbage fragment is returned.

### Root cause

Two compounding bugs:
1. `findBurstEnd` and `isStructuralHeading` are both fooled by a partial OCR transcription of the *previous* recipe's heading. `"FRON WHEAT BUNS (VARIATION 1)"` looks like a structurally valid ALL_CAPS title to all existing filters.
2. The dedup "shorter wins" rule again destroys the correct 2-line join (same mechanism as Failure 1).

---

## Common Themes

### Theme A: Dedup "shorter wins" destroys valid multi-line joins
Present in **Failures 1 and 3**. The rule is correct when the shorter string is a complete title and the longer string is title + noise (e.g., "Pierogi Ruskie 200g mąki …"). But when the shorter string is merely the *first line of a split title*, it wrongly evicts the complete join. There is no way for the current logic to distinguish these two cases.

### Theme B: `structuralBonus` is awarded to exactly one candidate
Present in **Failures 2 and 3**. The +0.10 bonus is given to `firstStructuralHeading` only. In Failure 2, this causes the second valid recipe title to fall below the threshold on a multi-recipe page. In Failure 3, it amplifies a garbage OCR fragment that wrongly claimed the `firstStructuralHeading` slot.

### Theme C: OCR corruption from adjacent pages poisons structural heading detection
Present in **Failure 3**. A corrupted ALL_CAPS fragment from the *previous* recipe (`FRON WHEAT BUNS` ← `SAFFRON WHEAT BUNS`) passes all structural heading tests and is elected as `firstStructuralHeading`. The algorithm has no mechanism to prefer later structural headings over earlier ones when the earlier one is garbled.

### Theme D: Continuation logic depends on selecting the correct base heading
Present in **Failure 3**. The continuation logic (lines 285–292) is sound for the SAFFRON case *if* the correct base heading is selected. Since the wrong base heading is selected (Theme C), the continuation logic never fires and the 2-line join title is never reassembled.

---

## Summary Table

| Failure | Primary bug | Secondary bug |
|---|---|---|
| Baked Eggs | Dedup "shorter wins" removes the 2-line join | None — single compounding failure |
| Finnish Flatbreads | structuralBonus only given to firstStructuralHeading; second title falls below threshold | Position factor penalty for late-document titles |
| Saffron Wheat Buns | OCR fragment from previous recipe claims firstStructuralHeading slot | Dedup removes the correct 2-line join |

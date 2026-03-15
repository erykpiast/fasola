# Iteration 16 Failure Analysis

## Failing Case

**File:** `Smażona zielona fasolka.real.txt`
**Expected:** `Smażona zielona fasolka`
**Got:** `''` (undefined / empty)

---

## Input Structure

```
Line 0: Smażona zielona fasolka        ← Polish title (mixed-case)
Line 1: GREEN BEANS BORKEUM            ← English translation (ALL_CAPS)
Line 2: 그린빈 볶음                    ← Korean translation
Line 3: Wymyslitem ten pireepis...     ← Author note (long, garbled)
...
Line 5: DLA & OSOB                     ← Serving size (correctly filtered)
...
Line 9: SKLADNIKI                      ← Section header (without ą diacritic)
```

This is a **trilingual recipe title block**: Polish title immediately followed by ALL_CAPS English romanization and then Korean script.

---

## Why the Algorithm Fails

### 1. Bilingual detection fires on the wrong candidate

The bilingual detection logic (`prePos0` + `nearbyAllCaps`) correctly identifies the layout:
- `prePos0` = `"Smażona zielona fasolka"` (position 0, mixed-case)
- `nearbyAllCaps` = `["GREEN BEANS BORKEUM"]` (position 1, ALL_CAPS, single)
- Method 2 (layout-based) confirms translation: no word overlap between Polish and English, both ≥ 2 words

`"GREEN BEANS BORKEUM"` is removed from `scoredForThreshold`. **This part works correctly.**

### 2. Multi-line joins mixing both languages are NOT suppressed

The bilingual detection filter removes candidates **starting with** the translation text:

```typescript
return !translationCandidates.some((t) => sLower.startsWith(t.text.toLowerCase()));
```

This does **not** remove:
- `"Smażona zielona fasolka GREEN BEANS BORKEUM"` (2-line join, starts with Polish)
- `"Smażona zielona fasolka GREEN BEANS BORKEUM 그린빈 볶음"` (3-line join, starts with Polish)

Both of these pass `passesHardFilters` completely:
- Length: 47 and 54 characters respectively (≤ 80) ✓
- Korean characters are stripped by `/[^a-zA-Z]/g` before garble checks, so they contribute no false-garble signal
- Vowel ratio: ~0.46 (Latin letters only) ✓
- Multi-word garble check: `"zielona"` and `"fasolka"` have length 7 > 2, not caught ✓

These composite candidates remain in `scoredForThreshold` with composite embeddings that blend Polish food vocabulary and English food terms. Their embedding similarity to the `TITLE_REFERENCE` may be **higher** than the Polish-only title, because `"GREEN BEANS"` is strongly associated with recipes in English-language embedding models.

### 3. Structural bonus is assigned to the translation, not the title

`isStructuralHeading("GREEN BEANS BORKEUM")` returns `true`:
- ALL_CAPS ✓
- 3 words ≥ 2 ✓
- All significant words ≥ 4 uppercase letters: GREEN(5), BEANS(5), BORKEUM(7) ✓

`"GREEN BEANS BORKEUM"` is therefore selected as `firstStructuralHeading` and assigned:
- `structuralBonus = 0.10`
- `allCapsBonus = 0.08`

These bonuses are computed in `scored` **before** bilingual detection. So the real Polish title (`"Smażona zielona fasolka"`) receives **no bonuses at all**, while the translation candidate it competes against had already been boosted by 0.18 in the `scored` array used by the fallback path.

### 4. Resulting score imbalance causes empty selection or wrong output

The combination of factors:

1. Polish title has no ALL_CAPS bonus, no structural bonus
2. Translation joins (mixing Polish + English) remain in `scoredForThreshold` with inflated composite scores
3. If the 2-line or 3-line join has the highest `thresholdScore`, `threshold = 0.7 × join_score`, which can exceed the Polish-only title's score
4. `selected` after threshold filtering may contain only the contaminated join(s), not the clean single-line title
5. The dedup step (`shorter wins`) can only help if the shorter single-line title is **also** in `selected` — if it didn't pass threshold, it was never added, so dedup never fires

This produces either:
- `undefined` (if every remaining candidate in `scoredForThreshold` somehow falls below threshold=0.08 and the fallback returns the highest-scored position-0 candidate, which is the join)
- Or `"Smażona zielona fasolka GREEN BEANS BORKEUM"` (the contaminated join, when it's the only survivor above threshold)

### 5. `SKLADNIKI` diacritic stripping bypasses section-label filter

A secondary (non-blocking) issue: the OCR text contains `"SKLADNIKI"` (without the `ą`). The `SECTION_LABELS` set contains `"składniki"` (with `ą`). The `isSectionLabel` normalization does:

```typescript
text.trim().replace(/[:.]$/, "").toLowerCase()  // → "skladniki"
```

This does **not** match `"składniki"`, so `"SKLADNIKI"` enters the candidate pool. Its embedding correctly classifies it as a header (high `headerSim`), so it doesn't win — but it adds noise to the threshold calculation.

---

## Common Themes

There is only one failure in this iteration. Its root causes map to known algorithm limitations:

1. **Bilingual join contamination**: The bilingual filter suppresses standalone translation candidates but not multi-line joins that *start* with the primary title and *include* the translation. The English vocabulary in those joins boosts their embedding score above the clean Polish-only candidate.

2. **Structural bonus misallocation**: When the ALL_CAPS line is a translation rather than the recipe title, `isStructuralHeading` still fires on it, assigning the 0.10 structural bonus to the wrong candidate. The `scored` array (used in the empty-pool fallback) retains this inflated score even after bilingual suppression.

3. **Diacritic-stripped section labels bypass the filter**: OCR regularly drops Polish diacritics. Section labels stored with diacritics (`składniki`, `przygotowanie`) don't match their diacritic-stripped OCR forms (`skladniki`, `przygotowanie` is fine since it has no diacritics, but `składniki` → `skladniki` fails). This allows section headers into the candidate pool.

---

## Fix Direction

The bilingual filter should also suppress candidates where **any** of the translation candidates appear as a **contiguous suffix** of the candidate text — not just as a prefix/start. Specifically:

```
"Smażona zielona fasolka GREEN BEANS BORKEUM"
```

contains `"GREEN BEANS BORKEUM"` as a suffix. Extending the suppression to:

```typescript
return !translationCandidates.some((t) =>
  sLower.startsWith(t.text.toLowerCase()) ||
  sLower.endsWith(t.text.toLowerCase()) ||
  sLower.includes(" " + t.text.toLowerCase())
);
```

…would remove all composite joins that embed the translation, leaving `"Smażona zielona fasolka"` as the dominant candidate in `scoredForThreshold`.

Separately, the structural bonus should not be assigned to a candidate that was subsequently identified as a translation — the structural heading selection and bilingual detection should run together before bonuses are finalized.

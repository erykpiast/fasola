# Iteration 17 — Improvement Plan

## Overview

One failure remains at 90.9% (10/11). The failing case ("Smażona zielona fasolka") exposes a structural gap in the bilingual detection pipeline: **the filter suppresses standalone translation candidates but not multi-line joins that embed the translation**. The English vocabulary in those joins inflates their embedding score above the clean Polish title, while the structural bonus is misallocated to the translation line.

The current architecture is sound — no fundamental redesign needed. Three targeted fixes address the root causes without touching the dedup logic or the scoring formula.

**Target accuracy: 11/11 (100%)**

---

## Failure: Smażona zielona fasolka → `''` (empty)

**Expected:** `Smażona zielona fasolka`
**Got:** `undefined` (empty string)

### Input layout

```
Line 0: Smażona zielona fasolka        ← Polish title (mixed-case)
Line 1: GREEN BEANS BORKEUM            ← English translation (ALL_CAPS)
Line 2: 그린빈 볶음                    ← Korean translation (filtered by garble check)
Line 3-4: [garbled prose paragraphs]
Line 5: DLA & OSOB                     ← serving size (caught by metadata pattern)
Line 9: SKLADNIKI                      ← section header (diacritic mismatch)
```

This is a trilingual recipe: Polish title → English ALL_CAPS romanization → Korean script.

---

## Root Cause 1: Bilingual join contamination

### What happens

The bilingual detection (lines 514–563) correctly identifies "GREEN BEANS BORKEUM" as a translation of position-0 "Smażona zielona fasolka" via Method 2 (layout-based, no word overlap). The standalone translation is removed from `scoredForThreshold`.

However, `buildCandidates` also generates multi-line joins:
- `"Smażona zielona fasolka GREEN BEANS BORKEUM"` (2-line join, position 0)
- `"Smażona zielona fasolka GREEN BEANS BORKEUM 그린빈 볶음"` (3-line join, position 0)

Both pass `passesHardFilters`:
- Length: 47 and 54 chars (≤80)
- Korean chars stripped by `/[^a-zA-Z]/g` before garble checks
- Vowel ratio ~0.46 (Latin only)

The bilingual suppression filter checks only `startsWith`:
```typescript
return !translationCandidates.some((t) => sLower.startsWith(t.text.toLowerCase()));
```

These joins **start with** the Polish title, not the translation, so they pass the filter. Their composite embeddings blend Polish food vocabulary with English food terms ("GREEN BEANS"), which MiniLM strongly associates with recipe contexts. The composite embedding likely scores higher against `TITLE_REFERENCE` than the Polish-only title.

### Fix: Extend bilingual suppression to catch embedded translations

**File:** `lib/text-classifier/title-extractor.ts`
**Location:** Lines 559–562 (the filter inside `scoredForThreshold`)

**Before:**
```typescript
scoredForThreshold = scored.filter((s) => {
  const sLower = s.text.toLowerCase();
  return !translationCandidates.some((t) => sLower.startsWith(t.text.toLowerCase()));
});
```

**After:**
```typescript
scoredForThreshold = scored.filter((s) => {
  const sLower = s.text.toLowerCase();
  return !translationCandidates.some((t) => {
    const tLower = t.text.toLowerCase();
    return sLower.startsWith(tLower) ||
           sLower.endsWith(tLower) ||
           sLower.includes(" " + tLower);
  });
});
```

### Why this works

- `"smażona zielona fasolka green beans borkeum"` → `endsWith("green beans borkeum")` → suppressed
- `"smażona zielona fasolka green beans borkeum 그린빈 볶음"` → `includes(" green beans borkeum")` → suppressed
- `"green beans borkeum"` → `startsWith("green beans borkeum")` → already suppressed (no change)
- `"Smażona zielona fasolka"` → contains no translation substring → survives

### Safety analysis

- The filter only fires when bilingual detection has already confirmed `translationCandidates`. This requires a mixed-case pos-0 line and nearby ALL_CAPS with no word overlap — a very specific layout.
- The `includes(" " + tLower)` check requires a space prefix, preventing partial word matches.
- No existing passing test case has a multi-line join that contains a translation candidate as a suffix or substring. The SAFFRON case has a continuation join with `/`, not a translation. The FINNISH case has two separate recipe titles, not a title+translation.

### Expected impact

This fix alone is sufficient to resolve the failure: with the contaminated joins removed from `scoredForThreshold`, the clean Polish title "Smażona zielona fasolka" becomes the dominant candidate.

---

## Root Cause 2: Structural bonus misallocation to translation

### What happens

`isStructuralHeading("GREEN BEANS BORKEUM")` returns true:
- ALL_CAPS ✓
- 3 words ≥ 2 ✓
- All significant words ≥ 4 uppercase letters: GREEN(5), BEANS(5), BORKEUM(7) ✓

This candidate becomes `firstStructuralHeading` (line 476) and receives:
- `structuralBonus = 0.10` (line 499)
- `allCapsBonus = 0.08` (line 494)

These bonuses are computed in `scored` (Pass 2, lines 486–508) **before** bilingual detection runs (lines 514–563). The bonuses are baked into the `scored` array used by the empty-pool fallback path (lines 577–582).

Even though "GREEN BEANS BORKEUM" is removed from `scoredForThreshold`, if the Polish title's score falls below the threshold, the fallback path uses `scored` (with the misallocated bonuses), potentially selecting the wrong candidate.

More importantly: if the contaminated 2-line join survives scoredForThreshold (pre-Fix-1), its threshold is inflated by the translation's boosted score, pushing the clean Polish title below the threshold cutoff.

### Fix: Exclude translation candidates from structural heading selection

**File:** `lib/text-classifier/title-extractor.ts`
**Location:** Restructure so bilingual detection runs before structural heading selection, OR retroactively nullify the structural bonus when the heading is identified as a translation.

The simpler approach: **re-run structural heading selection after bilingual detection**, excluding confirmed translations.

**Approach — post-hoc structural heading reassignment:**

After the bilingual detection block (line 564), check whether `firstStructuralHeading` is among the `translationCandidates`. If so, recompute the structural heading from the remaining candidates and patch the `scored` array.

**Before (conceptual — after line 563):**
```typescript
// (bilingual detection block ends)
// ... threshold computation continues
```

**After:**
```typescript
// If the structural heading was identified as a translation, reassign it
if (
  translationCandidates.length > 0 &&
  firstStructuralHeading &&
  translationCandidates.some((t) => t.text === firstStructuralHeading.text)
) {
  // Find the next best structural heading that isn't a translation
  const nonTranslationStructural = structuralCandidates.filter(
    (sc) => !translationCandidates.some((t) => t.text === sc.text)
  );
  const newHeading = nonTranslationStructural.length > 0
    ? nonTranslationStructural.reduce((a, b) => a.rawScore > b.rawScore ? a : b)
    : null;

  // Patch scored array: remove old structural bonus, apply new one
  for (const s of scored) {
    if (s.text === firstStructuralHeading.text) {
      s.score -= 0.10;
      s.baseScore -= 0.10;
    }
    if (newHeading && s.text === newHeading.text) {
      s.score += 0.10;
      s.baseScore += 0.10;
    }
  }
  // Update reference for downstream prefix-removal logic
  firstStructuralHeading = newHeading
    ? scored.find((s) => s.text === newHeading.text) ?? null
    : null;
}
```

**Note:** This requires making `firstStructuralHeading`, `structuralCandidates`, and `translationCandidates` accessible in the same scope. Currently `firstStructuralHeading` is `const` — it would need to become `let`. `structuralCandidates` is already available. `translationCandidates` is scoped inside the `if (prePos0)` block — it needs to be hoisted to the outer scope.

### Why this works

- "GREEN BEANS BORKEUM" is both the `firstStructuralHeading` and a `translationCandidate`.
- After reassignment, no structural bonus is awarded (no other structural candidate exists in this input).
- The Polish title competes on rawScore alone, without facing a +0.18 handicap.
- The `scored` array used by the fallback path is also corrected.

### Safety analysis

- Only fires when both bilingual detection AND structural heading selection have identified overlapping candidates. This is a narrow condition.
- If no translation is detected, structural heading assignment is unchanged.
- If the structural heading is NOT a translation (the common case — e.g., KREM SELEROWY, SAFFRON WHEAT BUNS), no reassignment occurs.
- The patch is additive to the existing scored values; it doesn't recompute scores from scratch.

### Expected impact

This fix is defense-in-depth for Root Cause 1. With Fix 1 alone, the contaminated joins are already removed, and the Polish title should win. Fix 2 ensures the fallback path also produces the correct answer, and prevents the structural bonus from inflating the threshold.

---

## Root Cause 3: Diacritic-stripped section labels (secondary)

### What happens

OCR text contains `"SKLADNIKI"` (without the `ą` diacritic). The `SECTION_LABELS` set contains `"składniki"` (with `ą`). The `isSectionLabel` function normalizes only case and trailing punctuation:

```typescript
const normalized = text.trim().replace(/[:.]$/, "").toLowerCase();
return SECTION_LABELS.has(normalized);
```

`"skladniki"` ≠ `"składniki"`, so the check fails. `SKLADNIKI` enters the candidate pool, adding noise to the threshold calculation.

### Fix: Diacritic-insensitive section label matching

**File:** `lib/text-classifier/title-extractor.ts`
**Location:** `isSectionLabel` function (lines 110–113) and `SECTION_LABELS` set (lines 99–108)

**Add a diacritic-stripping utility:**
```typescript
function stripDiacritics(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}
```

**Update `SECTION_LABELS` to store stripped forms:**
```typescript
const SECTION_LABELS = new Set([
  // English
  "ingredients", "directions", "instructions", "method", "preparation",
  "steps", "notes", "tip", "tips", "variations", "variation",
  "garnish", "topping", "toppings", "frosting", "filling",
  // Polish (stored without diacritics for OCR resilience)
  "skladniki", "przygotowanie", "sposob przygotowania", "sposob wykonania",
  "wykonanie", "wskazowki", "podpowiedz", "warianty",
  "sos", "nadzienie", "polewa", "lukier", "ciasto",
]);
```

**Update `isSectionLabel`:**
```typescript
function isSectionLabel(text: string): boolean {
  const normalized = stripDiacritics(text.trim().replace(/[:.]$/, "").toLowerCase());
  return SECTION_LABELS.has(normalized);
}
```

### Why this works

- `"SKLADNIKI"` → `toLowerCase()` → `"skladniki"` → `stripDiacritics()` → `"skladniki"` → matches
- `"SKŁADNIKI"` → `toLowerCase()` → `"składniki"` → `stripDiacritics()` → `"skladniki"` → matches
- `"składniki"` → `stripDiacritics()` → `"skladniki"` → matches
- All three OCR variants now caught

### Safety analysis

- Unicode NFKD + combining mark removal is a well-established technique, available in all JavaScript engines including Hermes (React Native).
- No legitimate recipe title would match a section label after diacritic stripping — section labels are structural words ("ingredients", "preparation"), not food names.
- English section labels have no diacritics, so they are unaffected.

### Expected impact

Non-blocking for the current failure (SKLADNIKI doesn't win regardless), but eliminates a noise source from the threshold calculation and prevents future regressions where a diacritic-stripped section label could tip the score balance.

---

## Summary of Changes

| # | Change | Location | Lines | Risk | Purpose |
|---|--------|----------|-------|------|---------|
| 1 | Extend bilingual suppression to catch embedded translations | `scoredForThreshold` filter (line 559) | ~5 | Low | Primary fix — removes contaminated joins |
| 2 | Reassign structural bonus when heading is a translation | After bilingual detection (line 564) | ~15 | Low | Defense-in-depth — fixes fallback path + threshold |
| 3 | Diacritic-insensitive section labels | `isSectionLabel` + `SECTION_LABELS` | ~8 | Very low | Noise reduction — OCR-resilient section filtering |

**Total: ~28 lines of new/modified code.**

### What is NOT changed

- The dedup logic (DO NOT CHANGE directive respected)
- The scoring formula (rawScore = titleSim − max(headerSim, noiseSim))
- The threshold formula (max(0.08, bestThresholdScore × 0.7))
- The capsCoalesced merge pass
- The multi-title guard
- The continuation join logic
- The metadata patterns (iter 15 DLA fix already handles this input)
- The embedding model or reference strings

### Interaction with previously passing cases

All 10 passing cases are unaffected:

1. **ARAYES SHRAK** — no bilingual layout detected → Fix 1/2 don't fire. No diacritics → Fix 3 neutral.
2. **Baked Eggs** — no bilingual layout → Fix 1/2 don't fire. No section labels affected.
3. **CHLEBEK Z WARZYWAMI** — no bilingual layout. Fix 3 helps if "SKŁADNIKI" appears without diacritics.
4. **FINNISH FLATBREADS** — multi-recipe page. No bilingual layout. No diacritics.
5. **Faszerowana papryka** — mixed-case Polish title. No nearby ALL_CAPS translation. Fixes don't fire.
6. **KREM SELEROWY** — breadcrumb at pos 0 filters out before bilingual detection. Fixes don't fire.
7. **LABANEH BALLS** — metadata continuation fix from iter 15 handles BALLS. No bilingual layout.
8. **MIXED SEED CRISPBREAD** — standard ALL_CAPS title. No bilingual layout.
9. **OVERNIGHT PIZZA DOUGH** — standard ALL_CAPS title. No bilingual layout.
10. **SAFFRON WHEAT BUNS** — continuation join. Structural heading is the real title, not a translation.

---

## Testing Plan

### New test cases needed

1. **Trilingual title with embedded translation join:**
   Input: mixed-case Polish line + ALL_CAPS English line + Korean line.
   Expected: Polish title wins; 2-line and 3-line joins containing English translation are suppressed.

2. **Structural bonus reassignment after bilingual detection:**
   Input: same as above but verify that `firstStructuralHeading` is not the translation line.
   Expected: no structural bonus awarded (no other structural candidate), Polish title wins on rawScore.

3. **Diacritic-stripped section label:**
   Input containing `"SKLADNIKI"` (without ą) as a candidate.
   Expected: `isSectionLabel("SKLADNIKI")` returns true; candidate is filtered.

### Regression tests (must still pass)

- All existing `extractTitleWithEmbeddings` tests in `title-extractor.test.ts`
- Full corpus run via `title-loop.py` against all 11 real inputs

### Edge cases to verify manually

- A recipe where the English ALL_CAPS line IS the title (not a translation) — bilingual detection should not fire because the mixed-case pos-0 line would overlap with the ALL_CAPS words (e.g., "Pierogi" at pos 0, "PIEROGI RUSKIE" at pos 1 — word overlap would prevent Method 2 from classifying it as a translation)
- A recipe where the structural heading is correctly identified but happens to share embedding similarity with pos-0 — the 0.4 cosine threshold should prevent false bilingual detection for same-language pairs

---

## Expected accuracy: 11/11 (100%)

- **Smażona zielona fasolka:** Contaminated joins suppressed (Fix 1), structural bonus not misallocated (Fix 2), SKLADNIKI filtered (Fix 3). Polish title wins as the dominant candidate in `scoredForThreshold`. **Fixed.**
- All 10 previously passing recipes: unchanged code paths (verified above).

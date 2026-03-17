# Task 01: Expand OCR repair dictionary with common English words

## Summary

Add ~50 common English and Polish words to `FOOD_DICTIONARY` so `repairOcrWord` can fix title words like `w1th`, `D1p`, `p1e`.

## Patterns Fixed

B (2 failures) and C (3 failures) = 5 total

## Files to modify

- `lib/text-classifier/food-dictionary.ts`

## Changes

Add a new section of common title words to the `FOOD_DICTIONARY` set in `food-dictionary.ts`. These words commonly appear in recipe titles but aren't food-specific, so `repairOcrWord` currently can't fix OCR corruption in them.

**Root cause:** `repairOcrWord` (title-extractor.ts:688-716) only matches against `FOOD_DICTIONARY`. When words like `with` contain OCR digit artifacts (`w1th`), repair fails because `with` isn't in the dictionary. The corrupted title then scores poorly on embeddings and gets skipped or loses to a body text line.

**Example trace:** Input `Bra1sed Cod w1th Wh1te W1ne`:
- `Bra1sed` → `braised` (in dictionary)
- `Cod` → no digits, passes through
- `w1th` → tries `with` (1→i) → NOT in dictionary → stays `w1th`
- `Wh1te` → `white` (in dictionary)
- `W1ne` → `wine` (in dictionary)
- Result: `Braised Cod w1th White Wine` — residual corruption degrades embedding score

**Add the following words** before the closing `]);` of the `FOOD_DICTIONARY` set, as a new section:

```typescript
  // ── Common title words (for OCR repair) ─────────────────────────────────
  // Prepositions & conjunctions
  "with", "from", "over", "under", "the", "and", "for",
  // Adjectives commonly in recipe titles
  "classic", "simple", "quick", "easy", "light",
  "thick", "thin", "old", "new",
  // Short food terms missing from main dictionary
  "dip", "bun", "buns", "roll", "rolls",
  "jam", "jelly", "loaf", "hash", "bowl",
  // Polish common title words (without diacritics)
  "pieczony", "pieczone", "smażony", "smażone",
  "gotowany", "gotowane", "duszone", "duszony",
  "domowy", "domowe", "tradycyjny", "tradycyjne",
```

**Note:** Some words like `pie`, `tart`, `cake`, `soup`, `stew`, `wrap`, `hot`, `crispy`, `creamy`, `spicy` are already in `FOOD_DICTIONARY` under other sections. Do NOT add duplicates. Before adding each word, verify it's not already present.

**Check for duplicates:** The following words from the spec's suggested list are already present and must NOT be added again:
- `hot` (line 60), `crispy` (line 64), `creamy` (line 64), `spicy` (line 64) — in "Common recipe adjectives"
- `pie`, `tart`, `cake`, `soup`, `stew`, `wrap`, `bowl` — in "Dish types" (lines 77-80)
- `pieczony`, `gotowany`, `smazony` (without diacritics versions) — check lines 124-126

## Verification

1. **Unit test:** Input `"Bra1sed Cod w1th Wh1te W1ne"` through `repairOcrText` → should return `"Braised Cod with White Wine"` (fully repaired).

2. **Unit test:** Input `"Lemon D1p"` through `repairOcrText` → should return `"Lemon Dip"`.

3. **No duplicate check:** Run `grep -c` on the dictionary file to ensure no word appears twice.

4. **Run evaluation harness:** `tools/title-loop/title-loop.py` — Pattern B and C failures should be fixed.

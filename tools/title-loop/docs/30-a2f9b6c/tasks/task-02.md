# Task 02: Add "sole" to the food dictionary

## Summary

Add the fish name "sole" to `FOOD_DICTIONARY` so OCR repair resolves `S01e` → `Sole` instead of `Soie`.

## Files to modify

- `lib/text-classifier/food-dictionary.ts` (line 9, fish section)

## Changes

The word `sole` (a common flatfish) is missing from the food dictionary. When the OCR repair function encounters `S01e`, it generates candidates for both `0→o, 1→i` (producing `Soie`) and `0→o, 1→l` (producing `Sole`). Without `sole` in the dictionary, the blind repair picks `Soie`. With `sole` present, dictionary-guided repair selects `Sole`.

**Current code (line 9):**

```typescript
"salmon", "cod", "halibut", "tuna", "trout", "sardine", "anchovy",
```

**Add `"sole"` to this fish line:**

```typescript
"salmon", "cod", "halibut", "tuna", "trout", "sardine", "anchovy", "sole",
```

That's it — one word addition. Do NOT add `"soie"` (French for silk, not a food word).

## Verification

Run the eval loop. Expect:

- The "Sole with Brown Butter and Capers" test case now passes (previously extracted `Soie` instead of `Sole`)
- 0 regressions on other test cases
- Optionally verify directly: `repairOcrWord("S01e")` should return `"Sole"` when the dictionary includes `"sole"`

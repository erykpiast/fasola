# Task 03: Pre-filter OCR normalization for cooking instruction detection

## Summary

Apply lightweight OCR digit→letter normalization in `passesHardFilters` before the cooking instruction check so OCR-corrupted verbs like `Podaw4ć` are correctly identified.

## Files to modify

- `lib/text-classifier/title-extractor.ts`

## Changes

In `passesHardFilters` (line 385), the `looksLikeCookingInstruction` check at line 391 runs on raw text. OCR-corrupted lines like `Podaw4ć letni lub chłodny.` fail the cooking instruction regex because `4` breaks the verb pattern. The line passes hard filters and enters the candidate pool.

**Modify `passesHardFilters` to apply lightweight OCR normalization before the cooking instruction check.** The normalization should only apply `4→a` (the specific failure case) with letter-adjacent context guards.

Replace the current cooking instruction check at line 391:

```typescript
// Before (line 391):
if (looksLikeCookingInstruction(text)) return false;
```

With:

```typescript
// Apply lightweight OCR normalization before instruction check
// so that "Podaw4ć" is recognized as "Podawać" (cooking instruction).
// Only 4→a for now — the specific OCR artifact causing failures.
// Uses same letter-adjacent guard logic as applyBlindOcrRepairToken.
const ocrNormForInstruction = text
  .replace(/(?<=[a-zà-ż])4/g, "a")
  .replace(/4(?=[a-zà-ż])/g, "a");
if (looksLikeCookingInstruction(text)) return false;
if (ocrNormForInstruction !== text && looksLikeCookingInstruction(ocrNormForInstruction)) return false;
```

**Design decision:** This is intentionally limited to `4→a` and only for the cooking instruction detection path. It does NOT modify the candidate text itself. Per the cross-iteration note in the improvement plan, iteration 24 established dictionary-guided OCR repair as the primary approach — this normalization is a narrow pre-filter, not a general-purpose repair.

**Why two checks:** The original text is still checked first (line `if (looksLikeCookingInstruction(text)) return false`). The OCR-normalized version is only checked if it differs from the original, avoiding unnecessary work for non-corrupted text.

## Verification

- `passesHardFilters("Podaw4ć letni lub chłodny.")` → `false` (cooking instruction after OCR norm)
- `passesHardFilters("Podaw4ć ciepło ze śmietaną lub lodami.")` → `false`
- `passesHardFilters("Variation 4 of pasta")` → unchanged behavior (4 not adjacent to lowercase)
- `passesHardFilters("Pierogi Ruskie")` → `true` (no OCR artifacts, passes normally)
- Run eval suite: Pattern 2 failures (`Podaw4ć` lines) should now be filtered out
- No regressions on currently-passing files

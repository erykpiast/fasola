# Task 02: Allow section-label words in multi-line title merges

## Summary

Relax the section-label merge block in caps-coalescing so single-word labels like `VEGETABLES` can merge with short preceding ALL_CAPS fragments.

## Patterns Fixed

E (1 failure) = 1 total

## Files to modify

- `lib/text-classifier/title-extractor.ts`

## Changes

### Context

The caps-coalescing loop (lines 505-548) pre-merges consecutive short ALL_CAPS lines that are OCR-fragmented headings. The merge condition at lines 529-530 blocks merging when `next.text` is a section label:

```typescript
// Current code (lines 525-538):
if (
  isAllCaps(next.text) &&
  wordCount(next.text) <= 2 &&
  next.text.length <= 25 &&
  !isSectionLabel(next.text) &&
  !isSectionLabel(repairOcrText(next.text)) &&
  !looksLikeMetadata(next.text) &&
  (merged + " " + next.text).length <= 80
) {
  merged += " " + next.text;
  j++;
} else {
  break;
}
```

This prevents `VEGETABLES` from merging with preceding `LEMON HERB ROASTED` because `vegetables` is in `SECTION_LABELS` (line 162). But `LEMON HERB ROASTED` is clearly an incomplete title fragment (3 words, ends mid-phrase).

### The fix

Replace the two section-label checks with a relaxed version that allows merging when:
1. The next line is a **single word** (section label)
2. The preceding merged text is **2-4 words** (short enough to be an incomplete fragment)

```typescript
// Replace lines 529-530:
//   !isSectionLabel(next.text) &&
//   !isSectionLabel(repairOcrText(next.text)) &&
// With:
  (!isSectionLabel(next.text) && !isSectionLabel(repairOcrText(next.text)) ||
   (wordCount(next.text) === 1 && wordCount(merged) >= 2 && wordCount(merged) <= 4)) &&
```

The full condition block becomes:

```typescript
if (
  isAllCaps(next.text) &&
  wordCount(next.text) <= 2 &&
  next.text.length <= 25 &&
  (!isSectionLabel(next.text) && !isSectionLabel(repairOcrText(next.text)) ||
   (wordCount(next.text) === 1 && wordCount(merged) >= 2 && wordCount(merged) <= 4)) &&
  !looksLikeMetadata(next.text) &&
  (merged + " " + next.text).length <= 80
) {
```

### Safety analysis

- Only fires for **single-word** section labels following **short** (2-4 word) ALL_CAPS fragments
- Multi-word section labels (`SPOSOB WYKONANIA`) are unaffected — they have wordCount > 1
- `SKŁADNIKI` following a complete 5+ word title would NOT merge (word count guard: `merged` must be ≤4 words)
- Standalone `VEGETABLES` as a candidate (without a preceding short fragment) is still blocked by `SECTION_LABELS` in `passesHardFilters` (line 381) — this relaxation only applies to the merge path

### Cross-iteration context

Iterations 18 and 22 deliberately added `"vegetables"` to `SECTION_LABELS` to prevent standalone `VEGETABLES` from being selected as a title. This fix preserves that protection for standalone candidates while relaxing it for merges. The `"placki"` precedent from iteration 22 (removed from `SECTION_LABELS` entirely because it starts recipe titles) shows the project already acknowledges category words can appear in titles.

## Verification

1. **Unit test:** Input with `LEMON HERB ROASTED` on line 1 and `VEGETABLES` on line 2 → caps-coalescing should produce `LEMON HERB ROASTED VEGETABLES`.

2. **Safety test:** Input with a complete 5-word title `CLASSIC FRENCH ONION SOUP GRATINEE` on line 1 and `VEGETABLES` on line 2 → should NOT merge (merged would be 5 words, exceeds ≤4 guard).

3. **Safety test:** Standalone `VEGETABLES` as the only ALL_CAPS line → should still be filtered by `passesHardFilters` → `isSectionLabel`.

4. **Run evaluation harness:** `tools/title-loop/title-loop.py` — Pattern E failure should be fixed.

# Task 02: Protect multi-line title joins from dedup when suffix is food-related

## Summary

Modify the dedup filter to keep multi-line join candidates when their suffix over the shorter prefix contains food-related words, preventing truncation of titles like "LEMON HERB ROASTED VEGETABLES" to "LEMON HERB ROASTED".

## Files to modify

- `lib/text-classifier/title-extractor.ts`

## Changes

### Modify the dedup filter (~lines 1376-1386)

The current dedup filter at line 1376 removes longer candidates when a shorter substring exists. This incorrectly removes multi-line joins where the continuation word is a food term (e.g., "VEGETABLES"). Add a protection check for multi-line joins whose suffix contains food-related words.

Current code:
```typescript
selected = selected.filter((a) => {
  const aLower = a.text.toLowerCase();
  // Protect compound titles — these use explicit separators and the full form is intentional
  if (/ [+:&] /.test(a.text)) return true;
  return !selected.some(
    (b) =>
      b !== a &&
      aLower.includes(b.text.toLowerCase()) &&
      b.text.length < a.text.length
  );
});
```

New code:
```typescript
selected = selected.filter((a) => {
  const aLower = a.text.toLowerCase();
  // Protect compound titles — these use explicit separators and the full form is intentional
  if (/ [+:&] /.test(a.text)) return true;
  return !selected.some((b) => {
    if (b === a) return false;
    if (b.text.length >= a.text.length) return false;
    if (!aLower.includes(b.text.toLowerCase())) return false;

    // Protect multi-line joins whose suffix over the shorter candidate is food-related.
    // E.g., "LEMON HERB ROASTED VEGETABLES" (2-line) vs "LEMON HERB ROASTED" (single):
    // "VEGETABLES" is in CATEGORY_SECTION_LABELS, so keep the longer form.
    if ((a.origin === "2-line" || a.origin === "3-line") &&
        aLower.startsWith(b.text.toLowerCase() + " ")) {
      const suffix = a.text.slice(b.text.length).trim();
      const suffixNorm = stripDiacritics(suffix.toLowerCase());
      if (CATEGORY_SECTION_LABELS.has(suffixNorm) ||
          FOOD_DICTIONARY.has(suffixNorm) ||
          suffix.split(/\s+/).some(w => FOOD_DICTIONARY.has(w.toLowerCase()))) {
        return false; // Don't remove `a` — its suffix is food-related
      }
    }

    return true;
  });
});
```

Key details:
- Only protects candidates with origin `"2-line"` or `"3-line"` (multi-line joins), not single-line candidates that happen to be longer
- Only fires when `a` starts with `b`'s text (prefix relationship), not arbitrary substring
- Checks the suffix against both `CATEGORY_SECTION_LABELS` (e.g., "vegetables", "soups") and `FOOD_DICTIONARY` (broader food terms)
- Falls through to word-level check (`suffix.split(...).some(...)`) for multi-word suffixes
- `stripDiacritics` is already available in the file (used elsewhere for section label matching)

Note the comment at line 1372 says "DO NOT CHANGE THIS LOGIC". This change is safe because it only *adds* a protection for multi-line joins — the default behavior (shorter wins) is unchanged for all other cases. The existing protection for compound titles (`/ [+:&] /`) is also preserved.

## Verification

1. Run eval and check that the Pattern 3 case improves:
   - Lemon Herb Roasted Vegetables → should now extract the full title instead of truncating to "LEMON HERB ROASTED"
2. Verify no regressions, especially:
   - "Pierogi Ruskie" should still win over "Pierogi Ruskie 200g mąki 3 ziemniaki" (this is a substring, not a prefix-with-food-suffix case)
   - Other existing dedup behavior is preserved

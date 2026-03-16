# Task 03: Add unit tests for vocabulary corroboration

## Summary

Add unit tests to verify corroboration correctly rejects orphaned OCR artifacts and keeps legitimate multi-recipe titles.

## Files to modify

- `lib/text-classifier/__tests__/title-extractor.test.ts`

## Changes

Add a new `describe` block for corroboration behavior within the existing test file. These tests exercise the full `extractTitle` pipeline with inputs designed to trigger the multi-title corroboration path.

### Test 1: Corroboration rejects orphaned OCR artifact

Create a test input that mimics the failing case: garbled preamble lines, an orphaned ALL_CAPS title from a previous page, then two legitimate recipe titles with supporting body text.

```typescript
it("rejects orphaned OCR artifact in multi-title assembly", async () => {
  const input = [
    "2 cup plus 1 tablespoon mixer fried with for 5 minutes",  // garbled overflow
    "nto a loured work counter shape into ball",                 // garbled overflow
    "DAT FLATBREADS",                                            // orphaned OCR artifact
    "le Finnish region of Savo bread more like a",               // previous recipe body
    "",
    "FINNISH MILK FLATBREADS",                                   // real title #1
    "",
    "These traditional Finnish milk flatbreads are soft and",
    "delicious served warm with butter",
    "500g flour",
    "300ml milk",
    "1 tsp salt",
    "",
    "Mix the flour and milk together until smooth",
    "Let the dough rest for 30 minutes",
    "",
    "FINNISH POTATO FLATBREADS",                                 // real title #2
    "",
    "Finnish potato flatbreads are hearty and filling",
    "3 large potatoes",
    "200g flour",
    "butter for frying",
    "",
    "Boil the potatoes until tender then mash",
    "Mix mashed potato with flour and salt",
  ].join("\n");

  const result = await extractTitle(input);
  expect(result).toBe("FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS");
});
```

### Test 2: Corroboration keeps legitimate multi-recipe titles

Verify that two real ALL_CAPS titles with body text referencing their words are both kept.

```typescript
it("keeps legitimate multi-recipe titles that are corroborated", async () => {
  const input = [
    "CHICKEN SOUP",
    "",
    "A classic chicken soup recipe",
    "1 whole chicken",
    "2 carrots",
    "salt and pepper",
    "",
    "Place the chicken in a large pot",
    "",
    "BEEF STEW",
    "",
    "A hearty beef stew for cold days",
    "500g beef chuck",
    "3 potatoes",
    "2 onions",
    "",
    "Cut the beef into cubes",
  ].join("\n");

  const result = await extractTitle(input);
  expect(result).toBe("CHICKEN SOUP + BEEF STEW");
});
```

### Test 3: Single-title path is unaffected

Verify that a single ALL_CAPS title with a unique word that doesn't appear in body text is NOT rejected (corroboration only applies to multi-title path).

```typescript
it("does not apply corroboration to single-title pages", async () => {
  const input = [
    "GOLONKA PIECZONA",
    "",
    "Składniki na 4 porcje",
    "1 kg mięsa",
    "2 cebule",
    "3 ząbki czosnku",
    "",
    "Mięso umyć i osuszyć",
    "Cebulę pokroić w plastry",
  ].join("\n");

  const result = await extractTitle(input);
  expect(result).toBe("GOLONKA PIECZONA");
});
```

### Notes on test setup

- These tests call `extractTitle` which requires the embedding model. Check how existing tests handle this — they likely use the real model or have a mock/setup. Follow the same pattern.
- The test inputs are designed with enough body text that the embedding scorer will rank the ALL_CAPS lines highly. Ingredient-like lines ("500g flour", "1 whole chicken") help the model identify recipe context.
- If tests are slow due to embeddings, consider whether there's an existing test timeout setting and follow it.

## Verification

1. `npx jest lib/text-classifier/__tests__/title-extractor.test.ts` — all new tests pass.
2. No existing tests regress.
3. Test 1 specifically validates the fix for the `FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS` failure case.

# Task 03: Lower word-count threshold for Polish cooking instruction detection

## Summary

Allow `looksLikeCookingInstruction` to catch 2-word Polish cooking instructions like `Ugotuj ziemniaki.` by applying language-specific word-count thresholds.

## Files to modify

- `lib/text-classifier/title-extractor.ts`, function `looksLikeCookingInstruction` (lines 364–370)

## Changes

The current `looksLikeCookingInstruction` requires `words.length >= 4` before checking any regex. This lets 2-word Polish cooking instructions like `Ugotuj ziemniaky.` slip through into the candidate pool, where they outscore the actual title.

Polish cooking instructions are unambiguous at 2 words because Polish recipe titles never start with bare imperative verbs (they use noun phrases like `Kopytka z Pieczarkami`). English recipe titles CAN start with cooking-like words (`Roast Chicken`), so the 4-word guard must remain for English.

**Current code (lines 364–370):**

```typescript
function looksLikeCookingInstruction(text: string): boolean {
  const words = text.trim().split(/\s+/);
  if (words.length < 4) return false;  // Instructions are multi-word sentences
  if (COOKING_INSTRUCTION_STARTS.test(text.trim())) return true;
  if (POLISH_COOKING_INSTRUCTION_STARTS.test(text.trim())) return true;
  return false;
}
```

**Replace with:**

```typescript
function looksLikeCookingInstruction(text: string): boolean {
  const words = text.trim().split(/\s+/);
  // Polish cooking instructions are commonly 2-3 words ("Ugotuj ziemniaki.", "Upiecz chleb.")
  // and are unambiguous because Polish recipe titles don't start with imperative verbs.
  if (POLISH_COOKING_INSTRUCTION_STARTS.test(text.trim())) {
    return words.length >= 2;  // Polish: 2+ words is enough
  }
  if (words.length < 4) return false;  // English: keep existing 4-word threshold
  if (COOKING_INSTRUCTION_STARTS.test(text.trim())) return true;
  return false;
}
```

Key changes:
1. Check the Polish regex FIRST, before the word-count guard
2. For Polish matches, require only `words.length >= 2`
3. For non-Polish text, keep the existing `words.length < 4` early return
4. The English `COOKING_INSTRUCTION_STARTS` check remains gated at 4+ words

**Why `Smażona zielona fasolka` is safe:** The regex `POLISH_COOKING_INSTRUCTION_STARTS` uses `^sma[zż]\b`. The word `Smażona` would need to match `smaż` followed by a word boundary — but `smaż` is followed by `o` (a word character), so `\b` doesn't fire. The adjective `Smażona` does NOT match. Only the bare imperative `Smaż` matches.

## Verification

Run the eval loop. Expect:

- The "Kopytka z Pieczarkami Leśnymi" test case now passes (previously `Ugotuj ziemniaky.` outscored the title)
- 0 regressions — especially verify Polish titles starting with adjective forms like `Smażona` are not caught as instructions
- Quick sanity checks:
  - `looksLikeCookingInstruction("Ugotuj ziemniaki.")` → `true`
  - `looksLikeCookingInstruction("Podawać ciepło.")` → `true`
  - `looksLikeCookingInstruction("Ugotuj")` → `false` (1 word)
  - `looksLikeCookingInstruction("Roast Chicken")` → `false` (English, <4 words)
  - `looksLikeCookingInstruction("Roast the chicken gently")` → `true` (English, 4 words)

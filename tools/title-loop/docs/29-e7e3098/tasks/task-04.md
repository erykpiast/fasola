# Task 04: Complete mixed-case blind OCR repair with 0→o, 4→a, 5→s

## Summary

Add missing `0→o`, `4→a`, `5→s` substitutions to the mixed-case branch of `applyBlindOcrRepairToken`, matching the coverage already present in the ALL_CAPS branch.

## Files to modify

- `lib/text-classifier/title-extractor.ts`

## Changes

### Change 1: Extend `applyBlindOcrRepairToken` (line 845)

The mixed-case return block (lines 852–856) currently only handles three substitutions:

```typescript
// Current (lines 852-856):
return token
  .replace(/(?<=[a-zà-ż])1/g, oneLetter)
  .replace(/1(?=[a-zà-ż])/g, oneLetter)
  .replace(/¡/g, "i")
  .replace(/€/g, "e");
```

The ALL_CAPS branch (lines 846–850) already handles `0→O` with adjacent-letter guards. The mixed-case branch needs the same for `0→o`, `4→a`, `5→s`.

**Replace the mixed-case return block with:**

```typescript
return token
  .replace(/(?<=[a-zà-ż])1/g, oneLetter)
  .replace(/1(?=[a-zà-ż])/g, oneLetter)
  .replace(/¡/g, "i")
  .replace(/€/g, "e")
  .replace(/(?<=[a-zà-ż])0/g, "o")
  .replace(/0(?=[a-zà-ż])/g, "o")
  .replace(/(?<=[a-zà-ż])4/g, "a")
  .replace(/4(?=[a-zà-ż])/g, "a")
  .replace(/(?<=[a-zà-ż])5/g, "s")
  .replace(/5(?=[a-zà-ż])/g, "s");
```

**Why lowercase-adjacent guards:** These prevent false positives on legitimate digits in titles like "Variation 4" or "Page 50". The ALL_CAPS branch uses `[A-ZÀ-Ż]` guards; the mixed-case branch uses `[a-zà-ż]` guards. A digit must be adjacent to at least one lowercase letter to trigger substitution.

### Change 2: Verify `generateBlindOcrVariants` (line 920)

No code change needed here. With the extended `applyBlindOcrRepairToken`, input like `S01e` will now produce `Sole` in a single pass (both `0→o` and `1→i` fire). The existing dual-variant logic (`i` vs `l`) still works correctly — it varies `1→i` vs `1→l`, and `0→o` fires in both variants.

Confirm that the function still produces correct variants:
- `S01e` → i-variant: `Sole` (0→o, 1→i), l-variant: `Sole` (0→o, 1→l... but `l` doesn't apply since `0→o` fires first making it `So1e` → `Sole`)
- Actually: `applyBlindOcrRepairToken("S01e", "i")` → `S` stays (uppercase, but token is not all-caps since `e` is lowercase), `0` has `1` on right (digit, not letter) and `S` on left (uppercase, not lowercase) → 0 does NOT fire. Wait — `S` is uppercase, not in `[a-zà-ż]`. So the guard `(?<=[a-zà-ż])0` won't match. But `0(?=[a-zà-ż])` will match because the character after `0` is `1`... no, `1` is a digit.

Let me reconsider: in `S01e`, the characters are S(uppercase), 0(digit), 1(digit), e(lowercase).
- `(?<=[a-zà-ż])0` — char before 0 is S (uppercase) → no match
- `0(?=[a-zà-ż])` — char after 0 is 1 (digit) → no match
- So `0→o` does NOT fire for `S01e`!

This means we need an additional rule: `0` adjacent to another OCR-suspect digit that will itself be repaired. But that's complex. The simpler fix: also add `0(?=1)` → `o` in mixed-case context, or relax to `0(?=[a-zà-ż1])`. However, this risks over-matching.

**Better approach:** Process the replacements in a specific order so earlier substitutions create the lowercase context needed by later ones. If `1→i` fires first, then `S0ie` has `0` followed by `i` (lowercase), so `0(?=[a-zà-ż])` would match. **Reorder the chain so `1→oneLetter` comes before `0→o`:**

```typescript
return token
  .replace(/(?<=[a-zà-ż])1/g, oneLetter)
  .replace(/1(?=[a-zà-ż])/g, oneLetter)
  .replace(/¡/g, "i")
  .replace(/€/g, "e")
  .replace(/(?<=[a-zà-ż])0/g, "o")
  .replace(/0(?=[a-zà-ż])/g, "o")
  .replace(/(?<=[a-zà-ż])4/g, "a")
  .replace(/4(?=[a-zà-ż])/g, "a")
  .replace(/(?<=[a-zà-ż])5/g, "s")
  .replace(/5(?=[a-zà-ż])/g, "s");
```

For `S01e`:
1. `(?<=[a-zà-ż])1` — char before `1` is `0` (digit) → no match
2. `1(?=[a-zà-ż])` — char after `1` is `e` (lowercase) → matches! `S01e` → `S0ie`
3. Now `0(?=[a-zà-ż])` — char after `0` is `i` (lowercase) → matches! `S0ie` → `Soie`

Wait, that gives `Soie`, not `Sole`. The `1→i` already fired, so we get `i` not `l`. For `oneLetter = "i"`, the result is `Soie`... that's wrong. The expected result is `Sole`.

The issue is that `1` in `S01e` should map to `l` (as in "Sole"), not `i`. This is exactly why `generateBlindOcrVariants` produces both `i` and `l` variants. With `oneLetter = "l"`:
1. `1(?=[a-zà-ż])` → matches `1e` → `S0le`
2. `0(?=[a-zà-ż])` → matches `0l` → `Sole` ✓

So the l-variant produces the correct `Sole`. The i-variant produces `Soie` (not a word, will score poorly in embeddings). This is the intended behavior — `generateBlindOcrVariants` tries both and lets the scoring pick the winner.

**The reordering is correct as written above.** The key insight is that `1→oneLetter` must come before `0→o` so the substituted letter creates the lowercase context needed for `0`.

Similarly, reorder `4→a` and `5→s` after `1→oneLetter` and `0→o` for the same chaining reason.

## Verification

- `applyBlindOcrRepairToken("S01e", "l")` → `"Sole"` (1→l first, then 0→o)
- `applyBlindOcrRepairToken("S01e", "i")` → `"Soie"` (1→i first, then 0→o; embedding will reject)
- `applyBlindOcrRepairToken("m4ki", "i")` → `"maki"` (4→a, lowercase-adjacent)
- `applyBlindOcrRepairToken("P5eudo", "i")` → `"Pseudo"` (5→s, lowercase-adjacent)
- `applyBlindOcrRepairToken("test5", "i")` → `"tests"` (5→s at end, `t` is lowercase before `5`)
- `applyBlindOcrRepairToken("Variation 4", "i")` → `"Variation 4"` (4 not adjacent to lowercase — space before, nothing after)
- Run eval suite: Pattern 7 (S01e → Sole) should now pass; Patterns 1, 4 should improve
- No regressions on currently-passing files

# Task 05: Improve mid-recipe page detection

## Summary

Add Unicode fraction support to `startsWithNumber` and body-prose detection to `isTitleAbsentPage` so mid-recipe continuation pages are correctly identified.

## Patterns Fixed

F (2 failures) = 2 total

## Files to modify

- `lib/text-classifier/title-extractor.ts`

## Changes

### Fix 1: Add Unicode fractions to `startsWithNumber`

The current `startsWithNumber` (lines 101-104) only matches ASCII digits:

```typescript
// Current:
function startsWithNumber(line: string): boolean {
  return /^\s*(?:[-•*]\s*)?\d/.test(line);
}
```

**Problem:** `½ red onion, thinly sliced` starts with Unicode fraction `½` which is not matched by `\d`. The line passes through `startsWithNumber` → `looksLikeIngredient` doesn't catch it → it can become a candidate.

**Fix:** Add Unicode fraction characters to the regex:

```typescript
function startsWithNumber(line: string): boolean {
  // Match lines starting with a digit or Unicode fraction, optionally preceded by bullet
  return /^\s*(?:[-•*]\s*)?[\d½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/.test(line);
}
```

### Fix 2: Add body-prose detection to `isTitleAbsentPage`

The current `isTitleAbsentPage` (lines 338-346) only checks for ingredients and cooking instructions:

```typescript
// Current:
function isTitleAbsentPage(lines: Array<string>): boolean {
  const nonEmptyLines = lines.map(l => l.trim()).filter(l => l.length > 0);
  if (nonEmptyLines.length < 3) return false;
  const first3 = nonEmptyLines.slice(0, 3);
  return first3.every(line => looksLikeIngredient(line) || looksLikeCookingInstruction(line));
}
```

**Problem:** For the Mushroom Risotto case, the page starts with `Reduce heat and stir...` — prose body text. While `looksLikeCookingInstruction` catches lines starting with cooking verbs, not all prose body text starts with a cooking verb. When one of the 3 lines is a descriptive sentence (not instruction-like), the "all 3" check fails.

**Fix:** Add an `isBodyProse` helper and include it in the check:

```typescript
function isBodyProse(line: string): boolean {
  // A line starting with a lowercase letter and having 4+ words is prose continuation
  return /^[a-ząćęłńóśźż]/.test(line) && wordCount(line) >= 4;
}

function isTitleAbsentPage(lines: Array<string>): boolean {
  const nonEmptyLines = lines.map(l => l.trim()).filter(l => l.length > 0);
  if (nonEmptyLines.length < 3) return false;
  const first3 = nonEmptyLines.slice(0, 3);
  return first3.every(line =>
    looksLikeIngredient(line) ||
    looksLikeCookingInstruction(line) ||
    isBodyProse(line)
  );
}
```

**Why lowercase start is reliable:** Recipe titles are capitalized (Title Case or ALL CAPS). A line starting with a lowercase letter is continuation prose, not a title. This is a strong signal for mid-recipe pages.

### Important: Preserve iteration 23 last-resort fallback

The spec explicitly warns about cross-iteration tension with iteration 23's last-resort fallback (returns the first hard-filter-passing candidate when embedding-based logic produces nothing).

**Resolution:** `isTitleAbsentPage` should raise the extraction threshold, NOT act as a hard gate. If `isTitleAbsentPage` is true but a position-0 candidate passes hard filters with rawScore ≥ 0.10, the last-resort fallback from iteration 23 should still be allowed to fire.

Check how `isTitleAbsentPage` is used in the extraction flow (likely around line 1171) and ensure it doesn't completely suppress extraction when there's a valid position-0 candidate. If the current guard already allows this, no change needed. If not, adjust the guard to:

```typescript
// Pseudocode — find the actual usage and adjust
if (titleAbsent && bestCandidate.position > 0) {
  // Only suppress candidates that aren't at position 0
  return "";
}
// Position-0 candidates with rawScore >= 0.10 can still pass through
```

### Where to place `isBodyProse`

Add the `isBodyProse` function right before `isTitleAbsentPage` (before line 338). It's a small helper used only by `isTitleAbsentPage`.

## Verification

1. **Unit test:** `startsWithNumber("½ red onion, thinly sliced")` → returns `true`.

2. **Unit test:** `startsWithNumber("¼ cup olive oil")` → returns `true`.

3. **Unit test:** `startsWithNumber("2 tablespoons butter")` → returns `true` (regression: ASCII digits still work).

4. **Unit test:** `isBodyProse("reduce heat and stir until combined")` → returns `true` (lowercase start, 6 words).

5. **Unit test:** `isBodyProse("LEMON HERB ROASTED")` → returns `false` (uppercase start).

6. **Unit test:** `isBodyProse("OK")` → returns `false` (< 4 words).

7. **Integration test:** Input starting with `½ red onion, thinly sliced\n1 cup diced tomatoes\nSalt and pepper` → `isTitleAbsentPage` returns `true`.

8. **Integration test:** Input starting with `reduce heat and stir...\nthen add the cream...\nseason to taste...` → `isTitleAbsentPage` returns `true`.

9. **Safety test:** Page with a valid title at position 0 and body prose on lines 1-3 → `isTitleAbsentPage` should NOT suppress the title if the candidate passes hard filters.

10. **Run evaluation harness:** `tools/title-loop/title-loop.py` — Pattern F failures should be fixed.

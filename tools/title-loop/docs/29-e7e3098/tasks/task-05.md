# Task 05: Add trailing parenthesized page/step number stripping

## Summary

Strip trailing `(N)` and `(p. N)` patterns from candidates in `buildCandidates` so page/step references don't affect scoring.

## Files to modify

- `lib/text-classifier/title-extractor.ts`

## Changes

### Change 1: Add `stripTrailingPageRef` function

Add a new function near the existing `stripPageNumber` (line 521) and `stripParentheticalGloss` (line 508):

```typescript
/**
 * Strip trailing parenthesized page or step numbers.
 * "Ugotuj ziemniaky. (38)" → "Ugotuj ziemniaky."
 * "RECIPE NAME (p. 42)" → "RECIPE NAME"
 */
function stripTrailingPageRef(text: string): string {
  return text.replace(/\s*\((?:p\.?\s*)?\d{1,4}\)\s*$/, "").trim();
}
```

### Change 2: Apply in `buildCandidates`

At line 648, the candidate text pipeline is:

```typescript
const singleText = repairOcrText(stripParentheticalGloss(stripPageNumber(line.text)));
```

Add `stripTrailingPageRef` to this chain:

```typescript
const singleText = repairOcrText(stripParentheticalGloss(stripTrailingPageRef(stripPageNumber(line.text))));
```

The order matters: `stripTrailingPageRef` should run after `stripPageNumber` (which strips leading page numbers) and before `stripParentheticalGloss` (which handles other parenthetical content). This way `(38)` is removed before the gloss check sees it.

### Why this helps

For Pattern 4, the line `Ugotuj ziemniaky. (38)` has a trailing page reference. While the primary fix is the cooking verb filter (Task 02), stripping `(38)` also helps:
1. The mid-sentence boundary check in `isLikelyGarbled` (`. ` followed by letter) is not confused by the period before `(38)`
2. If the line somehow passes the cooking instruction filter, the cleaner text scores differently

### Regex explanation

- `\s*` — optional leading whitespace before the parenthesis
- `\(` — literal opening paren
- `(?:p\.?\s*)?` — optional "p." or "p" prefix (for "p. 42" style references)
- `\d{1,4}` — 1 to 4 digit number
- `\)` — literal closing paren
- `\s*$` — optional trailing whitespace at end of string

## Verification

- `stripTrailingPageRef("Ugotuj ziemniaky. (38)")` → `"Ugotuj ziemniaky."`
- `stripTrailingPageRef("RECIPE NAME (p. 42)")` → `"RECIPE NAME"`
- `stripTrailingPageRef("RECIPE NAME (p42)")` → `"RECIPE NAME"`
- `stripTrailingPageRef("Pierogi (Polish Dumplings)")` → `"Pierogi (Polish Dumplings)"` (not a number, unchanged)
- `stripTrailingPageRef("Serves (4)")` → `"Serves"` (this is acceptable — a line like "Serves (4)" is metadata/instruction, not a title)
- Run eval suite: no regressions, minor scoring improvement for Pattern 4

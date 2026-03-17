# Task 04: Unified body-content prologue detection and isTitleAbsentPage integration

## Summary

Replace the separate cooking-instruction and prose-prologue checks in `findBurstEnd` with a unified detector that tolerates interleaved instruction/prose lines, and pass `burstEnd` to `isTitleAbsentPage` so it evaluates post-preamble content.

## Files to modify

- `lib/text-classifier/title-extractor.ts`

## Changes

### Change 1: Unify the instruction-prologue and prose-prologue checks in `findBurstEnd`

Replace lines ~478-505 (the two separate `if (i === 0)` blocks) with a single unified block:

**Current code:**
```typescript
  // Skip long instruction-like prologues: if 3+ consecutive lines look like cooking instructions,
  // skip them to find the actual title region.
  if (i === 0) {
    let j = 0;
    while (j < lines.length && looksLikeCookingInstruction(lines[j].text)) {
      j++;
    }
    if (j >= 3) {
      i = j;
    }
  }
  // Skip prose prologues: mid-recipe body text before the actual title.
  // If 3+ consecutive lines look like running body text (lowercase start, continuation,
  // or sentence-ending with many words), skip them.
  if (i === 0) {
    let j = 0;
    while (j < lines.length) {
      const t = lines[j].text;
      const isBodyText = (
        /^[a-ząćęłńóśźż]/.test(t) ||
        t.endsWith(",") ||
        (t.endsWith(".") && wordCount(t) > 4)
      ) && wordCount(t) >= 4;
      if (isBodyText) j++;
      else break;
    }
    if (j >= 3) i = j;
  }
```

**New code:**
```typescript
  // Skip body-content prologues: when 3+ consecutive lines at the start are cooking
  // instructions, prose continuations, or a mix of both, skip them to find the actual
  // title region. This unifies the previous separate instruction and prose checks to
  // handle interleaved patterns (e.g., instruction → prose continuation → instruction).
  if (i === 0) {
    let j = 0;
    while (j < lines.length) {
      const t = lines[j].text;
      const isInstruction = looksLikeCookingInstruction(t);
      const isProse = (
        /^[a-ząćęłńóśźż]/.test(t) ||
        t.endsWith(",") ||
        (t.endsWith(".") && wordCount(t) > 4)
      ) && wordCount(t) >= 4;
      const isContinuation = /^[a-ząćęłńóśźż]/.test(t) && wordCount(t) >= 2;

      if (isInstruction || isProse || isContinuation) {
        j++;
      } else {
        break;
      }
    }
    if (j >= 3) {
      i = j;
    }
  }
```

The key change: instructions and prose/continuation lines are counted together. A cooking instruction followed by a prose continuation followed by another instruction all count toward the threshold of 3. This handles the Mushroom Risotto pattern:
- Line 0: `Reduce heat and stir...` → `looksLikeCookingInstruction` matches → j=1
- Line 1: `creamy but still al dente...` → starts lowercase, 2+ words → `isContinuation` → j=2
- Line 2: `Season with salt...` → `looksLikeCookingInstruction` matches → j=3
- j≥3 → skip to line 3

### Change 2: Pass `burstEnd` to `isTitleAbsentPage`

Update `isTitleAbsentPage` to accept an optional `startFrom` parameter:

**Current signature (line ~370):**
```typescript
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

**New signature:**
```typescript
function isTitleAbsentPage(lines: Array<string>, startFrom: number = 0): boolean {
  const relevantLines = startFrom > 0 ? lines.slice(startFrom) : lines;
  const nonEmptyLines = relevantLines.map(l => l.trim()).filter(l => l.length > 0);

  if (nonEmptyLines.length < 3) return false;

  const first3 = nonEmptyLines.slice(0, 3);

  return first3.every(line =>
    looksLikeIngredient(line) ||
    looksLikeCookingInstruction(line) ||
    isBodyProse(line)
  );
}
```

### Change 3: Update the call site to pass `burstEnd`

At line ~918, update the call:

**Current code:**
```typescript
  const titleAbsent = isTitleAbsentPage(lines);
```

**New code:**
```typescript
  const titleAbsent = isTitleAbsentPage(lines, burstEnd);
```

This way, when `findBurstEnd` has already determined that lines 0..burstEnd are body content (and skipped them), `isTitleAbsentPage` evaluates whether the POST-preamble content has a title, rather than re-examining the already-skipped prologue lines. Without this change, `isTitleAbsentPage` would see the instruction/prose prologue lines and incorrectly conclude there's no title on the page.

## Verification

Run the eval suite and check that Mushroom Risotto now passes. The interleaved instruction/prose lines at the start should be skipped, and the actual title should be found after the prologue.

Watch for regressions especially in:
- Multi-recipe pages where `findBurstEnd` changes burst detection
- Recipes that legitimately open with 1-2 instruction lines (these stay under the threshold of 3)
- ALL_CAPS titles near the start of files (these break the unified loop because they're not lowercase-start, not cooking instructions)

All 11 previously-failing test cases should now pass with tasks 01-04 applied together.

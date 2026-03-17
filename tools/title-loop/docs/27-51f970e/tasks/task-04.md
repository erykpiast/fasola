# Task 04: Extend spillover detection and scope corroboration to post-spillover region

## Summary

Lower the cooking-instruction prologue threshold in `findBurstEnd` from 5 to 3, and add a `startLine` parameter to `passesCorroboration` so the multi-title guard checks vocabulary only against the post-spillover region.

## Files to modify

- `lib/text-classifier/title-extractor.ts`

## Changes

### 1. Lower cooking-instruction threshold in `findBurstEnd` (line 484)

In `findBurstEnd`, the cooking-instruction prologue skip currently requires 5+ consecutive instruction-like lines. Lower to 3 to catch shorter spillover blocks from previous recipes.

Change line 484:
```typescript
// Before:
    if (j >= 5) {
// After:
    if (j >= 3) {
```

Context (lines 477-487):
```typescript
  // Skip long instruction-like prologues: if 3+ consecutive lines look like cooking instructions,
  // skip them to find the actual title region.
  if (i === 0) {
    let j = 0;
    while (j < lines.length && looksLikeCookingInstruction(lines[j].text)) {
      j++;
    }
    if (j >= 3) {  // was: j >= 5
      i = j;
    }
  }
```

Also update the comment on line 477 from "5+ consecutive lines" to "3+ consecutive lines".

This is safe because iteration 26 improved `findBurstEnd`'s post-skip logic to look for structural markers (blank lines, separators, ALL_CAPS headings) before resuming — so even if we skip slightly more aggressively, the skip terminates at the first structural signal.

### 2. Add `startLine` parameter to `passesCorroboration` (lines 243-268)

Add an optional `startLine` parameter so corroboration can be scoped to only the post-spillover region of the document. This prevents spillover content from providing false vocabulary support for a foreign recipe title.

Change the function signature and loop:

```typescript
function passesCorroboration(
  text: string,
  position: number,
  allLines: string[],
  startLine: number = 0  // Only check corroboration against lines from this index onward
): boolean {
  const contentWords = extractContentWords(text);

  if (contentWords.length === 0) {
    return true; // No checkable words — pass through
  }

  let corroboratedCount = 0;
  for (const word of contentWords) {
    for (let i = startLine; i < allLines.length; i++) {  // was: i = 0
      if (i === position) continue;
      if (allLines[i].toUpperCase().includes(word)) {
        corroboratedCount++;
        break;
      }
    }
  }

  const score = corroboratedCount / contentWords.length;
  const threshold = contentWords.length <= 3 ? 1.0 : 0.67;
  return score >= threshold;
}
```

### 3. Pass `burstEnd` to corroboration in the multi-title guard (~lines 1397-1426)

In the multi-title guard where `passesCorroboration` is called (line 1402-1404), pass the burst end position so vocabulary from spillover doesn't count as corroboration.

To do this, `burstEnd` must be available in the scoring/filtering section. Currently `findBurstEnd` is called inside `buildCandidates` (line 549) and its result is local. Two approaches:

**Option A (preferred):** Compute `burstEnd` from `buildCandidates`' return or recalculate it. Since `buildCandidates` already calls `findBurstEnd`, the simplest approach is to return `burstEnd` alongside the candidates. Modify `buildCandidates` to return `{ candidates, burstEnd }`:

Change the return type/value of `buildCandidates`:
```typescript
function buildCandidates(
  lines: Array<string>
): { candidates: Array<{ text: string; position: number; origin: CandidateOrigin }>; burstEnd: number } {
  // ... existing code ...
  const burstEnd = findBurstEnd(nonEmptyLines);
  // ... rest of function ...
  return { candidates, burstEnd: burstEnd > 0 ? nonEmptyLines[burstEnd - 1]?.index ?? 0 : 0 };
}
```

Note: `burstEnd` from `findBurstEnd` is an index into `nonEmptyLines`, but we need it as a line index into the original `lines` array. Convert using `nonEmptyLines[burstEnd - 1]?.index ?? 0` (the original line index of the last skipped non-empty line), or `nonEmptyLines[burstEnd]?.index ?? 0` (the first non-skipped line). Use the latter for the corroboration start line.

Update the call site (in the main `extractTitle` function) to destructure:
```typescript
const { candidates, burstEnd } = buildCandidates(lines);
```

Then in the multi-title guard (line 1402-1404), pass `burstEnd`:
```typescript
const corroboratedCaps = allCapsSelected.filter((cap) =>
  passesCorroboration(cap.text, cap.position, lines, burstEnd)
);
```

**Option B (simpler):** Recompute `findBurstEnd` in the main function. This duplicates work but avoids changing `buildCandidates`' return type. Less clean but lower risk of breaking other call sites.

Choose Option A unless the return type change causes issues at other call sites.

## Verification

1. Run eval and check that the 2 Pattern 4 cases improve:
   - Mushroom Risotto → should no longer extract "CARPACCIO DI PESCE SPADA" (a foreign recipe title from spillover)
   - Peach Cobbler → should correctly identify the title after skipping instruction spillover
2. Verify no regressions, especially:
   - Cases where the recipe legitimately starts with cooking instructions (these should still work because the skip only fires when ALL first lines are instruction-like)
   - Cases with multiple ALL_CAPS titles (corroboration should still work correctly for non-spillover cases since `startLine` defaults to 0)
3. Pay special attention to any cases that had exactly 3-4 cooking instruction lines at the start — these are now in the skip zone

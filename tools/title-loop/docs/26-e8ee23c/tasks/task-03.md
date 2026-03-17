# Task 03: Improve spillover handling in `findBurstEnd`

## Summary

Fix `findBurstEnd` to skip further past spillover content when body text continues without a clear separator after the overflow marker.

## Patterns Fixed

A (5 failures) = 5 total

## Files to modify

- `lib/text-classifier/title-extractor.ts`

## Changes

### Context

The `findBurstEnd` function (lines 395-449) detects overflow markers like `SPILLOVER` and tries to skip past them. The current skip logic (lines 406-412) looks for the **next blank line or separator** after the marker:

```typescript
// Current code (lines 402-415):
for (let k = 0; k < lines.length && k < 30; k++) {
  if (OVERFLOW_MARKERS.test(lines[k].text)) {
    // Skip forward past the overflow block to the next visual separator or blank cluster
    let m = k + 1;
    while (m < lines.length) {
      if (/^[=\-]{4,}$/.test(lines[m].text) || lines[m].text.length === 0) {
        overflowEnd = m + 1;
        break;
      }
      m++;
    }
    if (overflowEnd === 0) overflowEnd = k + 1;
  }
}
```

**Problem:** When spillover content continues as body text without a blank line or separator, the skip stops at the first blank line (which may be just 1-2 lines after the marker). The actual title might be at line 10+, but the extractor gives up because no candidate emerges near the insufficiently-advanced burst end.

### Fix 1: Improve post-marker skip logic

Replace the inner skip loop to be more aggressive. After detecting an overflow marker, skip ALL subsequent lines until one of these termination conditions:

1. **≥2 consecutive blank lines** (stronger separator signal than a single blank)
2. **A visual separator line** (`====`, `----`)
3. **An ALL_CAPS line with ≥2 words** (structural signal for a new recipe heading)

```typescript
// Replace the inner while loop (lines 405-412) with:
    let m = k + 1;
    let consecutiveBlanks = 0;
    while (m < lines.length) {
      const lineText = lines[m].text;
      // Stop at visual separator
      if (/^[=\-]{4,}$/.test(lineText)) {
        overflowEnd = m + 1;
        break;
      }
      // Track consecutive blank lines
      if (lineText.trim().length === 0) {
        consecutiveBlanks++;
        if (consecutiveBlanks >= 2) {
          overflowEnd = m + 1;
          break;
        }
      } else {
        consecutiveBlanks = 0;
        // Stop at ALL_CAPS line with ≥2 words (likely next recipe heading)
        if (isAllCaps(lineText) && wordCount(lineText) >= 2) {
          overflowEnd = m; // Don't skip past the heading itself
          break;
        }
      }
      m++;
    }
    // If we walked to end without finding termination, skip everything we saw
    if (overflowEnd === 0) overflowEnd = Math.min(m, k + 1);
```

**Important:** The `overflowEnd = m` (not `m + 1`) for ALL_CAPS heading ensures we don't skip the title itself — it's the first candidate after the spillover.

### Fix 2: Adjust position scoring after spillover skip

In `extractTitleWithEmbeddings`, when `findBurstEnd` skipped a spillover preamble, candidates at position 10+ shouldn't be penalized just because they're far from line 0. The spec notes this is "already partially handled by the candidate-relative position bonus" — but `findBurstEnd` needs to actually advance past the spillover content for it to work.

The primary fix is Fix 1 above (making `findBurstEnd` advance further). Once `burstEnd` is correct, the existing candidate-relative position bonus should handle scoring. **No additional scoring changes are needed** unless testing shows otherwise.

### Helper functions used

The fix uses `isAllCaps` and `wordCount` which are already defined in the file. Verify their locations:
- `isAllCaps`: should be a utility function in the file
- `wordCount`: should be a utility function in the file

## Verification

1. **Test:** Input with `[CORRUPTED SPILLOVER...]` on line 0, followed by several lines of body text (no blank lines), then a title at line 10 → `findBurstEnd` should return a value that skips past the body text.

2. **Test:** Input with spillover marker, body text, then two consecutive blank lines, then a title → `findBurstEnd` should stop at the blank lines.

3. **Test:** Input with spillover marker, body text, then an ALL_CAPS heading with ≥2 words → `findBurstEnd` should stop just before the heading (so it becomes a candidate).

4. **Regression:** Input without spillover markers → `findBurstEnd` behavior unchanged (the overflow detection loop doesn't fire).

5. **Run evaluation harness:** `tools/title-loop/title-loop.py` — Pattern A failures should be fixed.

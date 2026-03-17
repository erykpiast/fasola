# Task 03: Broaden overflow marker detection

## Summary

Expand the `OVERFLOW_MARKERS` regex in `findBurstEnd` to match `CORRUPTED TEXT`, `PARTIAL RECIPE`, standalone `PREVIOUS PAGE`/`PREVIOUS RECIPE`, and bracketed annotation lines.

## Files to modify

- `lib/text-classifier/title-extractor.ts`

## Changes

### Change 1: Update the OVERFLOW_MARKERS regex

At line ~436, replace the existing regex:

**Current code:**
```typescript
  const OVERFLOW_MARKERS = /\b(PREVIOUS\s+(RECIPE|PAGE)\s+(OVERFLOW|CONTENT)|SPILLOVER|CONTINUATION|CORRUPTED\s+SECTION)\b/i;
```

**New code:**
```typescript
  const OVERFLOW_MARKERS = /\b(PREVIOUS\s+(RECIPE|PAGE)\b|SPILLOVER|CONTINUATION|CORRUPTED\s+(SECTION|TEXT)\b|PARTIAL\s+RECIPE)\b/i;
```

Changes:
- `PREVIOUS\s+(RECIPE|PAGE)` — no longer requires `OVERFLOW`/`CONTENT` after it. Any mention of "previous recipe" or "previous page" is an overflow signal.
- `CORRUPTED\s+(SECTION|TEXT)` — matches both `CORRUPTED SECTION` and `CORRUPTED TEXT`.
- `PARTIAL\s+RECIPE` — matches the `PARTIAL RECIPE` marker directly.

### Change 2: Add bracketed-annotation overflow detection

After the existing `OVERFLOW_MARKERS.test(lines[k].text)` check at line ~441, add an additional condition for bracketed annotations. Inside the `for` loop body (lines ~438-471), change:

**Current code:**
```typescript
    if (OVERFLOW_MARKERS.test(lines[k].text)) {
```

**New code:**
```typescript
    if (OVERFLOW_MARKERS.test(lines[k].text) || /^\[.*\b(PREVIOUS|CORRUPTED|SPILLOVER|CONTINUATION|PARTIAL)\b.*\]$/i.test(lines[k].text)) {
```

This catches lines like `[CORRUPTED TEXT FROM PREVIOUS PAGE - PARTIAL RECIPE]` that are clearly editorial annotations (wrapped in square brackets), not recipe content. The existing forward-scan logic after this condition handles finding the end of the overflow block (looking for `---` separators, blank clusters, or ALL_CAPS headings).

## Verification

Run the eval suite and check that Peach Cobbler now passes. The overflow text `[CORRUPTED TEXT FROM PREVIOUS PAGE - PARTIAL RECIPE]` at the start of the file should be detected, the forward scan should find the `---` separator, and `PEACH COBBLER` after it should be extracted as the title.

No regressions, especially:
- Files that legitimately contain "previous" or "page" in recipe text (these would need to be both inside brackets AND match the marker patterns)
- The existing overflow handling for `SPILLOVER`, `CONTINUATION` markers still works

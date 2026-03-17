# Task 02: Direct-successor bonus should skip blank lines

## Summary

Fix the direct-successor bonus to scan backward past blank lines when looking for a preceding section header, instead of only checking `position - 1`.

## Files to modify

- `lib/text-classifier/title-extractor.ts`

## Changes

Replace the direct-successor bonus block at lines ~1075-1089.

**Current code:**
```typescript
  for (let ci = 0; ci < scored.length && ci <= 2; ci++) {
    const candidate = scored[ci];
    if (candidate.position > 0) {
      const prevLine = lines[candidate.position - 1]?.trim() ?? "";
      const prevIsHeader =
        isSectionLabel(prevLine) ||
        looksLikeMetadata(prevLine) ||
        prevLine.includes(" | ");
      if (prevIsHeader) {
        candidate.score += 0.10;
        candidate.baseScore += 0.10;
        candidate.thresholdScore += 0.10;
      }
    }
  }
```

**New code:**
```typescript
  for (let ci = 0; ci < scored.length && ci <= 2; ci++) {
    const candidate = scored[ci];
    if (candidate.position > 0) {
      // Scan backward past blank lines to find nearest non-empty preceding line
      let prevPos = candidate.position - 1;
      while (prevPos >= 0 && lines[prevPos].trim() === "") {
        prevPos--;
      }
      if (prevPos >= 0) {
        const prevLine = lines[prevPos].trim();
        const prevIsHeader =
          isSectionLabel(prevLine) ||
          looksLikeMetadata(prevLine) ||
          prevLine.includes(" | ");
        if (prevIsHeader) {
          candidate.score += 0.10;
          candidate.baseScore += 0.10;
          candidate.thresholdScore += 0.10;
        }
      }
    }
  }
```

The key change: instead of `lines[candidate.position - 1]`, scan backward with a while-loop to skip blank lines. This handles the common pattern where a blank line separates a section header from the title:

```
FISH & SEAFOOD        ← header (line 0), isSectionLabel matches
                      ← blank (line 1)
Halibut with ...      ← title (line 2), prevPos scans back to 0
```

No changes to `isSectionLabel` are needed — it already handles `VEGETABLES`, `FISH & SEAFOOD`, and other English food categories (added in iteration 22). The `prevLine.includes(" | ")` check already catches pipe-separated metadata like `Lato | Zupy | DLA 4 OSÓB`.

## Verification

Run the eval suite and check that these 3 test cases now pass:
- Halibut with Saffron Cream Sauce
- Roasted Asparagus with Parmesan
- Ogórkowa Zupa

No regressions, especially on multi-recipe pages where section headers appear mid-document.

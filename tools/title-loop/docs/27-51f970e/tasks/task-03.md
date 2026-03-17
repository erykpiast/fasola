# Task 03: Add direct-successor bonus for candidates immediately following section headers

## Summary

Add a scoring bonus for candidates whose immediately preceding line is a section header, metadata, or pipe-separated line, improving extraction when a category/section header precedes the title.

## Files to modify

- `lib/text-classifier/title-extractor.ts`

## Changes

### Add direct-successor bonus in the scoring pass (~after line 1055)

After the existing first-after-preamble bonus logic (which ends at line 1055 with the `maxPositionalBoost` cap), add a new "direct-successor" bonus. This bonus fires when the line immediately before a candidate is a section header or metadata line, regardless of what preceded that header.

The existing first-after-preamble bonus (lines 1024-1044) requires ALL preceding lines to be filtered/empty. The direct-successor bonus is complementary: it only checks the immediately preceding line.

Insert after the `maxPositionalBoost` cap block (after line 1055):

```typescript
  // Direct-successor bonus: when the line immediately before this candidate is a
  // section label, metadata, or pipe-separated line, the candidate is very likely
  // the title that follows that header. This complements the first-after-preamble
  // bonus which requires ALL preceding lines to be filtered — this one fires even
  // when earlier non-filtered lines exist.
  for (let ci = 0; ci < scored.length && ci <= 2; ci++) {
    const candidate = scored[ci];
    if (candidate.position > 0) {
      const prevLine = lines[candidate.position - 1]?.trim() ?? "";
      const prevIsHeader = isSectionLabel(prevLine) ||
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

Important details:
- The loop uses `ci <= 2` to limit to the first 3 candidates (by score order, since `scored` is sorted by score descending). This prevents the bonus from firing on random mid-document candidates.
- The bonus is +0.10, which stacks with the first-after-preamble bonus but both are constrained by the overall scoring dynamics.
- `isSectionLabel` (line 190) checks against `SECTION_LABELS` set (ingredients, directions, etc. in English/Polish)
- `looksLikeMetadata` (line 226) checks `METADATA_PATTERNS` (serves/makes/yields, times)
- The `prevLine.includes(" | ")` check catches pipe-separated metadata like `Lato | Zupy | DLA 4 OSÓB`
- All three score components (`score`, `baseScore`, `thresholdScore`) are incremented to maintain consistency with how other bonuses work

Note: The `maxPositionalBoost` cap (line 1048) only applies to the first candidate's combined preamble + position bonus. The direct-successor bonus is a separate mechanism. If stacking becomes an issue in eval, the bonus value (0.10) can be tuned down.

## Verification

1. Run eval and check that the 3 Pattern 2 cases improve:
   - Halibut with Saffron Cream Sauce (preceded by "FISH & SEAFOOD" section header)
   - Roasted Asparagus with Parmesan (preceded by section header)
   - Ogórkowa Zupa (preceded by pipe-separated metadata `Lato | Zupy | DLA 4 OSÓB | ...`)
2. Verify no regressions on cases that already have section headers preceding titles (these should only get better or stay the same)
3. Check that the bonus doesn't fire on mid-document candidates (the `ci <= 2` guard)

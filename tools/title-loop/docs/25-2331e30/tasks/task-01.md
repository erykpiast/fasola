# Task 01: Add `corroborationScore()` helper function

## Summary

Add a new `corroborationScore()` function to `title-extractor.ts` that measures how many of a candidate's content words appear elsewhere in the document.

## Files to modify

- `lib/text-classifier/title-extractor.ts`

## Changes

Add the following function near the other scoring helpers (after `isAllCaps` around line 203, or in the helper function area before the main `extractTitle` function).

```typescript
/**
 * Measures vocabulary overlap between a candidate title and the rest of the document.
 * Returns a ratio (0–1) of the candidate's content words (≥4 letters) that appear
 * in at least one other line. Used to detect orphaned OCR artifacts in multi-title pages.
 */
function corroborationScore(
  candidateText: string,
  candidatePosition: number,
  allLines: string[]
): number {
  const contentWords = candidateText
    .split(/\s+/)
    .filter((w) => w.replace(/[^a-zA-ZÀ-ÿ]/g, "").length >= 4)
    .map((w) => w.toUpperCase());

  if (contentWords.length === 0) {
    return 1.0; // No checkable words — pass through
  }

  let corroboratedCount = 0;
  for (const word of contentWords) {
    for (let i = 0; i < allLines.length; i++) {
      if (i === candidatePosition) continue;
      if (allLines[i].toUpperCase().includes(word)) {
        corroboratedCount++;
        break;
      }
    }
  }

  return corroboratedCount / contentWords.length;
}
```

Key design decisions:
- **Word length threshold ≥4**: Skips short function words like "THE", "WITH", "AND", "OAT" that could coincidentally match. Content words like "FLATBREADS", "FINNISH", "POTATO", "MILK" are ≥4 letters.
- **Case-insensitive matching**: Uppercases both candidate words and line text for comparison.
- **Skips candidate's own line**: A word corroborating itself is meaningless.
- **Returns 1.0 for zero content words**: Prevents false rejection of very short titles.

## Verification

1. The function should be syntactically valid TypeScript — `npx tsc --noEmit` should pass.
2. Manually trace through the failing case:
   - `DAT FLATBREADS` → content words: `["FLATBREADS"]` (DAT is only 3 letters, filtered out) → wait, "DAT" has 3 letters which is < 4, so only "FLATBREADS" remains → corroborated (appears on lines 16, 29) → score = 1.0

   **Important**: With the ≥4 filter, "DAT" (3 letters) is excluded, so the score for `DAT FLATBREADS` would be 1/1 = 1.0, NOT 0.5. This means the threshold logic in Task 02 must account for this. See Task 02 for how this is handled — the threshold rule uses `contentWords.length` to determine strictness.

   Actually, re-examining: "DAT" has 3 alphabetic characters. With `w.replace(/[^a-zA-ZÀ-ÿ]/g, "").length >= 4`, "DAT" → 3 chars → filtered out. Only "FLATBREADS" (10 chars) remains. Score = 1/1 = 1.0.

   This means the ≥4 threshold alone won't catch this case. The word length filter needs to be **≥3** instead to include "DAT", giving content words `["DAT", "FLATBREADS"]`, score = 1/2 = 0.5.

   **Correction**: Use `length >= 3` instead of `length >= 4`:

```typescript
    .filter((w) => w.replace(/[^a-zA-ZÀ-ÿ]/g, "").length >= 3)
```

   With ≥3: "DAT" (3 chars) is included. Content words: `["DAT", "FLATBREADS"]`. "DAT" appears nowhere else → not corroborated. "FLATBREADS" appears on lines 16, 29 → corroborated. Score = 1/2 = 0.5.

   But ≥3 also includes common short words like "THE", "AND", "FOR", "WITH" (4 chars — wait, those are ≥3). We need to be careful. However, common English words like "THE" and "AND" would almost always be corroborated (they appear everywhere), so including them doesn't cause false rejections — it just inflates scores slightly. The risk is only with words like "DAT" that are unusual AND short.

   **Final decision**: Use `>= 3` to catch the specific failure case. Common 3-letter words ("THE", "AND", "FOR") will almost always be corroborated, so they won't cause false rejections.

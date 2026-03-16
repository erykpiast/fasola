# Task 02: Integrate corroboration filter into multi-title assembly

## Summary

Apply the `corroborationScore()` function from Task 01 to filter out uncorroborated ALL_CAPS candidates in the multi-title assembly path.

## Files to modify

- `lib/text-classifier/title-extractor.ts`

## Changes

In the multi-title assembly block (~line 1254), inside the `allCapsSelected.length >= 2` branch, add corroboration filtering **after** identifying the ALL_CAPS survivors but **before** the sub-header check.

### Current code (lines 1254–1270):

```typescript
    if (allCapsSelected.length >= 2) {
      // Check whether non-first ALL_CAPS headings are section headers within one recipe
      // (followed immediately by ingredient-like content) rather than separate recipe titles.
      // A multi-recipe page has body text between titles; a single-recipe page has
      // ingredient lines immediately after each section heading.
      const sortedCaps = [...allCapsSelected].sort((a, b) => a.position - b.position);
      const isSubHeader = sortedCaps.slice(1).every((cap) => {
        const nextLines = lines.slice(cap.position + 1, cap.position + 3);
        return nextLines.some(
          (l) => looksLikeIngredient(l.trim()) || /^\s*\d/.test(l.trim())
        );
      });
      if (isSubHeader) {
        selected = [sortedCaps[0]];
      } else {
        selected = allCapsSelected;
      }
```

### New code:

```typescript
    if (allCapsSelected.length >= 2) {
      // Vocabulary corroboration: filter out ALL_CAPS candidates whose content words
      // don't appear elsewhere in the document. This catches orphaned OCR artifacts
      // (e.g., "DAT FLATBREADS" from a preceding page) that look structurally identical
      // to real titles but have no vocabulary support in the document body.
      const corroboratedCaps = allCapsSelected.filter((cap) => {
        const score = corroborationScore(cap.text, cap.position, lines);
        const contentWords = cap.text
          .split(/\s+/)
          .filter((w) => w.replace(/[^a-zA-ZÀ-ÿ]/g, "").length >= 3);
        // Short candidates (≤3 content words): require 100% corroboration.
        // Longer candidates (>3 content words): require ≥67% corroboration.
        const threshold = contentWords.length <= 3 ? 1.0 : 0.67;
        return score >= threshold;
      });

      // Use corroborated candidates if any remain; otherwise fall back to original set
      // (don't remove all candidates — that would break legitimate multi-title pages
      // where corroboration fails for benign reasons).
      const capsToUse = corroboratedCaps.length >= 2 ? corroboratedCaps : allCapsSelected;

      // Check whether non-first ALL_CAPS headings are section headers within one recipe
      // (followed immediately by ingredient-like content) rather than separate recipe titles.
      // A multi-recipe page has body text between titles; a single-recipe page has
      // ingredient lines immediately after each section heading.
      const sortedCaps = [...capsToUse].sort((a, b) => a.position - b.position);
      const isSubHeader = sortedCaps.slice(1).every((cap) => {
        const nextLines = lines.slice(cap.position + 1, cap.position + 3);
        return nextLines.some(
          (l) => looksLikeIngredient(l.trim()) || /^\s*\d/.test(l.trim())
        );
      });
      if (isSubHeader) {
        selected = [sortedCaps[0]];
      } else {
        selected = capsToUse;
      }
```

### Key design decisions

1. **Threshold rule**: For candidates with ≤3 content words (the common case for recipe titles), require 100% corroboration. For longer candidates (>3 words), allow ≥67%. This is strict for short candidates where a single uncorroborated word is suspicious.

2. **Fallback to original set**: If corroboration filtering removes ALL candidates (or leaves fewer than 2), fall back to the unfiltered `allCapsSelected`. This prevents the filter from being destructive when it can't help.

3. **Word length ≥3 in threshold calculation**: Must match the same threshold used in `corroborationScore()` (Task 01). "DAT" is 3 letters, so ≥3 is required to catch it.

4. **Placement before sub-header check**: The corroboration filter narrows the candidate set, then the existing sub-header logic operates on the narrowed set. This preserves the existing sub-header behavior for legitimate multi-recipe pages.

### Trace through the failing case

Input has 3 ALL_CAPS candidates: `DAT FLATBREADS` (pos 3), `FINNISH MILK FLATBREADS` (pos 15), `FINNISH POTATO FLATBREADS` (pos 28).

- `DAT FLATBREADS`: content words (≥3 chars) = ["DAT", "FLATBREADS"]. "DAT" not found elsewhere → score = 1/2 = 0.5. Threshold for 2 words = 1.0. 0.5 < 1.0 → **filtered out**.
- `FINNISH MILK FLATBREADS`: content words = ["FINNISH", "MILK", "FLATBREADS"]. All found elsewhere → score = 1.0. Threshold = 1.0. 1.0 ≥ 1.0 → **kept**.
- `FINNISH POTATO FLATBREADS`: content words = ["FINNISH", "POTATO", "FLATBREADS"]. All found elsewhere → score = 1.0. Threshold = 1.0. 1.0 ≥ 1.0 → **kept**.

`corroboratedCaps` = 2 candidates (both FINNISH titles). `capsToUse` = corroborated set (≥2). Sub-header check runs on the 2 real titles → likely not sub-headers → `selected` = both real titles. Final output: `FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS`.

## Verification

1. `npx tsc --noEmit` passes (no type errors).
2. Run the title-loop evaluation: `cd tools/title-loop && python title-loop.py`
   - `FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS` should now pass.
   - No regressions in real or generated files.
3. Existing unit tests pass: `npx jest lib/text-classifier/__tests__/title-extractor.test.ts`

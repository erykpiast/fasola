# Task 01: Preserve standalone candidate when continuation-merging

## Summary

Always emit the original line in `buildCandidates` before emitting the merged continuation, so parenthetical annotations no longer destroy the title candidate.

## Files to modify

- `lib/text-classifier/title-extractor.ts` (lines 646–658)

## Changes

The continuation-merge loop currently replaces the original line with the merged form and skips ahead. When a line like `(OCR CORRUPTION: ...)` follows a title, the merge produces an overlong string that fails the hard word/char filter, and the original standalone title is lost.

**Current code (lines 646–658):**

```typescript
const mergedLines: Array<{ text: string; index: number }> = [];
for (let i = 0; i < capsCoalesced.length; i++) {
  const line = capsCoalesced[i];
  if (i + 1 < capsCoalesced.length) {
    const nextText = capsCoalesced[i + 1].text;
    if (/^[/&+:(]/.test(nextText)) {
      mergedLines.push({ text: `${line.text} ${nextText}`, index: line.index });
      i++;
      continue;
    }
  }
  mergedLines.push(line);
}
```

**Replace with:**

```typescript
const mergedLines: Array<{ text: string; index: number }> = [];
for (let i = 0; i < capsCoalesced.length; i++) {
  const line = capsCoalesced[i];
  mergedLines.push(line);  // always keep the original standalone
  if (i + 1 < capsCoalesced.length) {
    const nextText = capsCoalesced[i + 1].text;
    if (/^[/&+:(]/.test(nextText)) {
      mergedLines.push({ text: `${line.text} ${nextText}`, index: line.index });
      i++;
      continue;
    }
  }
}
```

The key difference: `mergedLines.push(line)` is moved before the `if` block so the original line is always emitted. When a continuation match occurs, *both* the standalone and the merged form enter `mergedLines`. The downstream `seen` set (line ~661) deduplicates by normalized text, and the scoring logic picks the better candidate.

**Why this is safe:** In real continuation cases like `SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE`, both the standalone `SAFFRON WHEAT BUNS WITH QUARK` and the merged full form are generated. Existing prefix-removal and multi-title logic handles this correctly — the test for that case already has prefix-removal that eliminates the standalone when the merge is better.

## Verification

Run the eval loop (`python tools/title-loop/eval_only.py` or equivalent). Expect:

- 6 previously-failing generated files now pass (the ones with `(OCR CORRUPTION: ...)` annotations on line 3)
- 0 regressions on currently-passing files
- Specifically verify `SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE` still extracts the full merged title (not just the standalone prefix)
- Specifically verify `Baked Eggs with Feta, Harissa Tomato Sauce & Coriander` still extracts the full title including `& Coriander`

# Task 06: Strengthen first-after-metadata positional bonus for pipe+ALL_CAPS pattern

## Summary

Raise the `maxPositionalBoost` cap from `0.15` to `0.18` when the candidate follows pipe-separated metadata and is ALL_CAPS, fixing Pattern 5 (Ogórkowa Zupa).

## Files to modify

- `lib/text-classifier/title-extractor.ts`

## Changes

### Context

Pattern 5 failure: A document starts with pipe-separated metadata, then a blank line, then the ALL_CAPS title `OGÓRKOWA ZUPA`. The first-after-preamble bonus fires correctly (+0.12 for structural preamble), but the combined positional bonus is capped at `+0.15` (line 1182). This leaves insufficient headroom when the preamble bonus (+0.12) stacks with the candidate-relative position bonus, because the combined total gets clamped.

The `maxPositionalBoost` cap was introduced in iteration 26 to prevent over-boosting. The iteration 8 rawScore floor of `-0.05` prevents candidates with actively negative signal from leaking through. Both safeguards must be preserved.

### Change: Make `maxPositionalBoost` context-dependent

At line 1182, replace:

```typescript
const maxPositionalBoost = 0.15;
```

With:

```typescript
// Raise cap slightly for pipe-separated metadata followed by ALL_CAPS candidate.
// This is a near-certain title pattern in Polish cookbooks where MiniLM
// (English-centric) gives weak embedding scores for Polish ALL_CAPS text.
const hasPipePreamble = lines
  .slice(0, firstCandidate.position)
  .some((line) => line.trim().includes(" | "));
const maxPositionalBoost =
  hasPipePreamble && isAllCaps(firstCandidate.text) ? 0.18 : 0.15;
```

### Why this is safe

1. **The rawScore floor (`-0.05`) from iteration 8 is untouched.** Candidates with actively negative embedding scores are still blocked from the fallback path.
2. **The cap raise is narrow:** it only applies when (a) preceding lines contain pipe-separated metadata AND (b) the candidate is ALL_CAPS. This is a specific pattern in Polish cookbook OCR.
3. **The cap raise is small:** +0.03 (from 0.15 to 0.18). The preamble bonus (0.12) and direct-successor bonus (0.10) can now both contribute partially without total clamping, but the total is still bounded.
4. **The layered bonus system from iterations 24/26/27 remains intact.**

### Note on `isAllCaps`

The `isAllCaps` function should already be available in scope (it's used extensively in the file, e.g., in `applyBlindOcrRepairToken` at line 846). Verify it's accessible at the point of use (line ~1182).

### Fallback note

Per the improvement plan: if this change alone is insufficient (the candidate still doesn't score high enough), the root cause is likely that Changes A–D haven't improved the OCR repair enough. This task should be implemented last and evaluated after tasks 01–05. The improvement plan explicitly notes: "Re-evaluate after implementing Changes A–D before adding further positional overrides."

## Verification

- Pattern 5 test case (Ogórkowa Zupa): the ALL_CAPS title after pipe-separated metadata should now win
- Verify the maxPositionalBoost is 0.18 only when pipe metadata + ALL_CAPS conditions are met
- Verify the maxPositionalBoost remains 0.15 for all other cases
- Run eval suite: Pattern 5 should pass; no regressions on currently-passing files
- Specifically verify that non-pipe-metadata ALL_CAPS candidates are NOT affected (cap stays at 0.15)

# Task 04: Raise positional boost cap for pipe-metadata + ALL_CAPS Polish titles

## Summary

Increase `maxPositionalBoost` from 0.18 to 0.22 for pipe-separated metadata followed by ALL_CAPS candidates, so Polish ALL_CAPS titles like `OGÓRKOWA ZUPA` clear the scoring threshold despite weak MiniLM embeddings.

## Files to modify

- `lib/text-classifier/title-extractor.ts` (lines 1238–1239, positional bonus cap)

## Changes

MiniLM is English-centric and gives weak raw embedding scores for Polish ALL_CAPS text. The pipe-metadata + ALL_CAPS pattern is a near-certain title indicator in Polish cookbooks. The current cap of 0.18 (raised from 0.15 in iter 30) is still insufficient for `OGÓRKOWA ZUPA`.

**Current code (lines 1238–1239):**

```typescript
const maxPositionalBoost =
  hasPipePreamble && isAllCaps(firstCandidate.text) ? 0.18 : 0.15;
```

**Replace with:**

```typescript
const maxPositionalBoost =
  hasPipePreamble && isAllCaps(firstCandidate.text) ? 0.22 : 0.15;
```

Single constant change: `0.18` → `0.22`. The extra 0.04 headroom accounts for MiniLM's English bias on Polish ALL_CAPS text.

**Why this is safe:** The cap only applies when ALL conditions are met: (1) all preceding lines are filtered out, (2) preceding lines include pipe-separated metadata, (3) the candidate is ALL_CAPS. This is a very specific pattern that is nearly always a recipe title in Polish cookbooks. The 0.22 value is still conservative — it only allows the positional bonus to contribute more, not bypass scoring entirely.

## Verification

Run the eval loop. Expect:

- The "Ogórkowa Zupa" test case now passes (previously scored too low despite being the only real candidate)
- 0 regressions — the higher cap only fires for the narrow pipe+ALL_CAPS condition
- Combined with tasks 01–03, total failures should drop from 9 to 1 (only Mushroom Risotto remains, which is unfixable — title absent from document)

# Iteration 20 → 21 Improvement Plan

## Summary

One failure, one root cause, one fix. The 8-word filter's separator exception regex is missing `/`, causing a correctly merged continuation title to be rejected.

---

## Failure: 8-Word Filter Blocks `/`-Separated Variant Titles

### Root cause

The guard at `title-extractor.ts:282`:

```typescript
if (words.length >= 8 && !/ [+:&] /.test(text)) return false;
```

rejects `SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)` (10 words) because ` / ` is not matched by the character class `[+:&]`. The continuation pre-merge step correctly merged lines 54–55 into this single candidate, but `passesHardFilters` discards it. Because the merge consumed line 55, the standalone 5-word prefix `SAFFRON WHEAT BUNS WITH QUARK` never enters the candidate pool either. The algorithm falls back to the wrong (truncated OCR) heading from the previous recipe on the page.

### Fix

Add `/` to the separator exception character class:

**Before (line 282):**
```typescript
if (words.length >= 8 && !/ [+:&] /.test(text)) return false;
```

**After:**
```typescript
if (words.length >= 8 && !/ [+:&/] /.test(text)) return false;
```

This is consistent with the existing treatment of `/` elsewhere in the pipeline:
- The continuation pre-merge already recognizes `/` as a continuation character (`/^[/&+:(]/.test(nextText)` at line 407).
- The continuation-join protection logic already handles `/` (`/^[/&+:(]/.test(remainder)` at line 773).
- The multi-slash breadcrumb filter (line 272) already permits single-`/` titles through.

Adding `/` to the 8-word exception makes the hard filter consistent with these existing rules.

### Risk assessment

**Low.** The `/` separator in cookbook titles is structurally identical to ` + `, ` : `, and ` & ` — it separates a base recipe name from a variation/subtitle. No body-text sentence uses ` / ` as a word separator, so this change cannot admit false positives. The existing 2-slash breadcrumb filter (line 272) still blocks navigation lines like `/ Jesien / Zupy`.

### Expected impact

- The SAFFRON WHEAT BUNS regression is fixed: the merged 10-word title passes `passesHardFilters`, qualifies as a structural heading, and wins scoring as it did in iteration 19.
- All other test cases remain unaffected (no other candidate is blocked by the 8-word filter with a single `/`).
- Real-file pass rate returns to 100% (11/11).

---

## No other changes needed

No other patterns are failing. The pipeline's core architecture (continuation pre-merge → caps coalescence → candidate building → embedding scoring → structural heading selection → dedup) is working correctly for all 11 real files and all generated files. This iteration requires only the one-character regex fix described above.

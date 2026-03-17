# Task 01: Expand garbled token detection to multi-word candidates

## Summary

Add multi-word garbled token detection to `isLikelyGarbled` so candidates like `XxYyZz salt and pepper` are correctly rejected.

## Files to modify

- `lib/text-classifier/title-extractor.ts`

## Changes

In `isLikelyGarbled` (line 271), the `[a-z][A-Z]` internal transition check at line 302 only fires for single-word candidates (`words.length === 1`). Multi-word candidates containing garbled tokens like `XxYyZz` pass through.

**After the existing short-word check block (around lines 325–333), add:**

```typescript
// Multi-word candidate with a garbled token: a word with internal
// lowercase→uppercase transition that isn't a known camelCase pattern
// (e.g., "McDonald", "McCormick"). Catches "XxYyZz", "UuIw" etc.
const hasGarbledCamelCase = words.some(
  (w) =>
    w.length >= 3 &&
    /[a-z][A-Z]/.test(w) &&
    !/^(Mc|Mac)[A-Z]/.test(w) // Exempt Scottish/Irish names
);
if (hasGarbledCamelCase) {
  return true;
}
```

This should be placed before the `return false` at line 336, alongside the other multi-word checks.

**Why `w.length >= 3`:** Single-character or two-character words can't meaningfully contain an internal transition. Three characters is the minimum for a pattern like `aB` to be embedded in a word (e.g., `aBc`).

**Why the `Mc`/`Mac` exemption:** Legitimate names like "McDonald" or "MacGregor" have a lowercase→uppercase transition but are not garbled. This is unlikely in recipe OCR but is a safe guard.

## Verification

- `isLikelyGarbled("XxYyZz salt and pepper")` → `true`
- `isLikelyGarbled("McDonald Spice Blend")` → `false` (Mc exemption)
- `isLikelyGarbled("Żurek Krakowski")` → `false` (no garbled tokens)
- `isLikelyGarbled("Salt and Pepper")` → `false` (normal title)
- Run eval suite: Pattern 3 failure (Żurek Krakowski) should now pass
- No regressions on currently-passing files

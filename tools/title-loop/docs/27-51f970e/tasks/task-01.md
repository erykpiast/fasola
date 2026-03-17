# Task 01: Extract `applyBlindOcrRepair` and add OCR-repaired variants for early candidates

## Summary

Extract blind digit→letter substitution logic from `normalizeOcrTitle` into a reusable `applyBlindOcrRepair` function, then call it in `buildCandidates` to generate OCR-repaired variant candidates for the first few lines.

## Files to modify

- `lib/text-classifier/title-extractor.ts`

## Changes

### 1. Add `applyBlindOcrRepair` function (after `repairOcrText` ~line 810)

Extract the blind substitution logic from `normalizeOcrTitle` (lines 832-863) into a standalone function. This function applies the same digit→letter substitutions but as a candidate generator (before embedding), not post-processing (after winner selection).

```typescript
/**
 * Apply blind OCR digit-for-letter repair without dictionary lookup.
 * Used to generate additional candidates for early-position lines where
 * positional evidence is strong enough to justify speculative repair.
 */
function applyBlindOcrRepair(text: string): string {
  if (isAllCaps(text)) {
    return text
      .replace(/1/g, "I")
      .replace(/0(?=[A-ZÀ-Ż])/g, "O")
      .replace(/(?<=[A-ZÀ-Ż])0/g, "O")
      .replace(/4(?=[A-ZÀ-Ż])/g, "A")
      .replace(/(?<=[A-ZÀ-Ż])4/g, "A")
      .replace(/5(?=[A-ZÀ-Ż])/g, "S")
      .replace(/(?<=[A-ZÀ-Ż])5/g, "S")
      .replace(/¡/g, "I")
      .replace(/€/g, "E")
      .replace(/[ÍÌ]/g, "I");
  }
  // Mixed-case: fix per-word (digits between lowercase letters)
  return text.split(/(\s+)/).map((token) => {
    if (/^\s+$/.test(token)) return token;
    if (isAllCaps(token) && token.length > 1) {
      return token
        .replace(/1/g, "I")
        .replace(/0(?=[A-Z])/g, "O")
        .replace(/(?<=[A-Z])0/g, "O");
    }
    return token
      .replace(/(?<=[a-zà-ż])1/g, "l")
      .replace(/1(?=[a-zà-ż])/g, "l")
      .replace(/¡/g, "i")
      .replace(/€/g, "e");
  }).join("");
}
```

### 2. Refactor `normalizeOcrTitle` to use `applyBlindOcrRepair`

Replace the inline substitution logic in `normalizeOcrTitle` (lines 832-863) with a call to the new function:

```typescript
// Step 2: OCR character substitution.
const beforeSub = text;
text = applyBlindOcrRepair(text);
```

This is a pure refactor — no behavioral change.

### 3. Add blind-repaired variant candidates in `buildCandidates`

In the `buildCandidates` function, after the single-line candidate is added (around line 653-655), add a block that generates a blind-repaired variant for early-position candidates:

```typescript
    // Single line candidate added above...
    candidates.push({ text: singleText, position: line.index, origin: "single" });
      }
    }

    // Blind OCR repair for early-position candidates: when the original text
    // has OCR artifacts and is in the first few lines (strong positional evidence),
    // generate an additional candidate with blind digit→letter repair.
    // This gives the embedding scorer a clean version even when dictionary repair misses.
    if (line.index <= 5 && OCR_ARTIFACT_PATTERN.test(line.text)) {
      const blindRepaired = applyBlindOcrRepair(singleText);
      if (blindRepaired !== singleText && passesHardFilters(blindRepaired)) {
        const norm = blindRepaired.toLowerCase();
        if (!seen.has(norm)) {
          seen.add(norm);
          candidates.push({ text: blindRepaired, position: line.index, origin: "single" });
        }
      }
    }
```

Note: `line.text` is checked for `OCR_ARTIFACT_PATTERN` (the raw text), but `applyBlindOcrRepair` is applied to `singleText` (which already had dictionary-guided repair via `repairOcrText`). This way, blind repair fills in what dictionary repair missed.

The `line.index <= 5` guard limits blind repair to the title region (first 5 lines), where positional evidence is strong enough to justify speculative substitution.

## Verification

1. Run `npx tsx tools/title-loop/eval_only.py` (or equivalent eval command) and check that the 5 Pattern 1 cases improve:
   - Braised Cod with White Wine
   - Drożdże Sernik
   - Piernik z Śliwkami
   - Roasted Beet and Walnut Dip
   - Żurek Krakowski
2. Verify no regressions on existing passing test cases
3. Verify that `normalizeOcrTitle` produces identical output after the refactor (it delegates to the same logic)

# Task 01: Dual-variant blind OCR repair with erratic casing normalization

## Summary

Replace the single-output `applyBlindOcrRepair` with a multi-variant generator that produces both `1→i` and `1→l` candidates, and add erratic-casing normalization for lines like `KoPyTka`.

## Files to modify

- `lib/text-classifier/title-extractor.ts`

## Changes

### Part A: Add `generateBlindOcrVariants` function

Add a new function after `applyBlindOcrRepair` (after line ~862) that generates both `i` and `l` variants:

```typescript
/**
 * Generate multiple blind OCR repair variants for embedding comparison.
 * For ALL_CAPS text, returns a single variant (1→I is unambiguous).
 * For mixed-case text, returns two variants: one with 1→i and one with 1→l,
 * letting the embedding scorer pick the better one.
 */
function generateBlindOcrVariants(text: string): Array<string> {
  if (isAllCaps(text)) {
    // ALL_CAPS: single variant, same as current applyBlindOcrRepair
    const repaired = applyBlindOcrRepair(text);
    return repaired !== text ? [repaired] : [];
  }

  const variants: Array<string> = [];

  // i-variant: 1→i between lowercase letters
  const iVariant = text.split(/(\s+)/).map((token) => {
    if (/^\s+$/.test(token)) return token;
    if (isAllCaps(token) && token.length > 1) {
      return token
        .replace(/1/g, "I")
        .replace(/0(?=[A-Z])/g, "O")
        .replace(/(?<=[A-Z])0/g, "O");
    }
    return token
      .replace(/(?<=[a-zà-ż])1/g, "i")
      .replace(/1(?=[a-zà-ż])/g, "i")
      .replace(/¡/g, "i")
      .replace(/€/g, "e");
  }).join("");

  // l-variant: 1→l between lowercase letters (current behavior)
  const lVariant = applyBlindOcrRepair(text);

  if (iVariant !== text) variants.push(iVariant);
  if (lVariant !== text && lVariant !== iVariant) variants.push(lVariant);

  return variants;
}
```

### Part B: Add erratic-casing detection and normalization

Add these two functions near the OCR repair utilities (before `generateBlindOcrVariants`):

```typescript
function hasErraticCasing(text: string): boolean {
  return text.split(/\s+/).some(word => {
    if (word.length < 3) return false;
    if (isAllCaps(word)) return false;
    // Check for uppercase letters after position 0 that aren't part of known patterns
    const inner = word.slice(1);
    const upperInner = (inner.match(/[A-ZÀ-Ż]/g) || []).length;
    const lowerInner = (inner.match(/[a-zà-ż]/g) || []).length;
    return upperInner >= 2 && upperInner >= lowerInner * 0.3;
  });
}

function normalizeErraticCasing(text: string): string {
  return text.split(/(\s+)/).map(token => {
    if (/^\s+$/.test(token)) return token;
    if (isAllCaps(token)) return token;
    if (hasErraticCasing(token)) {
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    }
    return token;
  }).join("");
}
```

### Part C: Update the OCR repair block in `buildCandidates`

Replace the existing blind OCR repair block at lines ~658-671:

**Current code:**
```typescript
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

**New code:**
```typescript
    if (line.index <= 5 && (OCR_ARTIFACT_PATTERN.test(line.text) || hasErraticCasing(line.text))) {
      let repairable = singleText;
      if (hasErraticCasing(repairable)) {
        repairable = normalizeErraticCasing(repairable);
      }
      const variants = generateBlindOcrVariants(repairable);
      for (const variant of variants) {
        if (variant !== singleText && passesHardFilters(variant)) {
          const norm = variant.toLowerCase();
          if (!seen.has(norm)) {
            seen.add(norm);
            candidates.push({ text: variant, position: line.index, origin: "single" });
          }
        }
      }
    }
```

Note: Also add the erratic-casing-only path — when there are no OCR artifacts but casing is erratic, the normalized text itself should be added as a candidate:

```typescript
    if (line.index <= 5 && (OCR_ARTIFACT_PATTERN.test(line.text) || hasErraticCasing(line.text))) {
      let repairable = singleText;
      if (hasErraticCasing(repairable)) {
        repairable = normalizeErraticCasing(repairable);
        // Add the casing-normalized version as a candidate even without OCR repair
        if (repairable !== singleText && passesHardFilters(repairable)) {
          const norm = repairable.toLowerCase();
          if (!seen.has(norm)) {
            seen.add(norm);
            candidates.push({ text: repairable, position: line.index, origin: "single" });
          }
        }
      }
      const variants = generateBlindOcrVariants(repairable);
      for (const variant of variants) {
        if (variant !== singleText && variant !== repairable && passesHardFilters(variant)) {
          const norm = variant.toLowerCase();
          if (!seen.has(norm)) {
            seen.add(norm);
            candidates.push({ text: variant, position: line.index, origin: "single" });
          }
        }
      }
    }
```

## Verification

Run the eval suite and check that these 6 test cases now pass:
- Braised Cod with White Wine
- Drożdże Sernik
- Piernik z Śliwkami
- Roasted Beet and Walnut Dip
- Żurek Krakowski
- Kopytka z Pieczarkami Leśnymi

No regressions on previously passing tests. The extra candidates (at most ~5 additional) stay well within the 25-candidate cap.

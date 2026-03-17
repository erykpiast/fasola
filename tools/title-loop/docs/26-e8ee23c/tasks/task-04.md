# Task 04: Strengthen first-after-preamble bonus

## Summary

Make the first-after-preamble bonus more robust by including section labels as "filtered" lines, increase the bonus when preamble contains section labels/metadata, and cap combined positional boost.

## Patterns Fixed

D (3 failures) = 3 total

## Files to modify

- `lib/text-classifier/title-extractor.ts`

## Changes

### Context

The first-after-preamble bonus (lines 960-977) checks whether ALL preceding lines were filtered or empty. If so, the first surviving candidate gets +0.08:

```typescript
// Current code (lines 964-977):
const firstCandidate = scored[0];
if (firstCandidate.position > 0) {
  const allPrecedingFiltered = lines
    .slice(0, firstCandidate.position)
    .every((line) => {
      const trimmed = line.trim();
      return trimmed === "" || !passesHardFilters(trimmed);
    });
  if (allPrecedingFiltered) {
    firstCandidate.score += 0.08;
    firstCandidate.baseScore += 0.08;
    firstCandidate.thresholdScore += 0.08;
  }
}
```

**Problem:**
- The +0.08 bonus may not be enough to push candidates like `Halibut with Saffron Cream Sauce` above threshold
- The `allPrecedingFiltered` check doesn't explicitly include `isSectionLabel` (though `passesHardFilters` already checks it — this is a safety net)

### Fix 1: Make `allPrecedingFiltered` more robust

Add explicit `isSectionLabel` check as a safety net:

```typescript
const allPrecedingFiltered = lines
  .slice(0, firstCandidate.position)
  .every((line) => {
    const trimmed = line.trim();
    return trimmed === "" || !passesHardFilters(trimmed) || isSectionLabel(trimmed);
  });
```

### Fix 2: Increase bonus when preamble contains structural markers

When the filtered preamble contained a section label or metadata line (not just empty lines), increase the bonus from +0.08 to +0.12. This gives stronger positional evidence.

```typescript
if (allPrecedingFiltered) {
  // Check if preamble contained structural markers (section labels or metadata)
  const hasStructuralPreamble = lines
    .slice(0, firstCandidate.position)
    .some((line) => {
      const trimmed = line.trim();
      return trimmed !== "" && (isSectionLabel(trimmed) || looksLikeMetadata(trimmed) || trimmed.includes(" | "));
    });
  const preambleBonus = hasStructuralPreamble ? 0.12 : 0.08;
  firstCandidate.score += preambleBonus;
  firstCandidate.baseScore += preambleBonus;
  firstCandidate.thresholdScore += preambleBonus;
}
```

### Fix 3: Cap combined positional boost

The candidate-relative position bonus (from iteration 24) can add ~+0.08-0.12 for position 0 among surviving candidates. When combined with the first-after-preamble bonus, the total could reach ~+0.24 which risks over-boosting non-title candidates.

Find the candidate-relative position bonus code (should be near the first-after-preamble bonus). After both bonuses are applied, add a cap:

```typescript
// After both positional bonuses are applied, cap combined contribution
// (This should go after both the first-after-preamble and candidate-relative position bonus blocks)
const maxPositionalBoost = 0.15;
// If the combined boost exceeds the cap, clamp it
const totalPositionalBoost = scored[0].score - originalScore; // need to capture originalScore before bonuses
if (totalPositionalBoost > maxPositionalBoost) {
  const excess = totalPositionalBoost - maxPositionalBoost;
  scored[0].score -= excess;
  scored[0].baseScore -= excess;
  scored[0].thresholdScore -= excess;
}
```

**Implementation note:** To implement the cap, capture the first candidate's score BEFORE any positional bonuses are applied, then after all positional bonuses, clamp the difference to 0.15. The exact approach depends on where the candidate-relative position bonus is applied — find it and add the cap after both bonus blocks.

## Verification

1. **Test:** Input `FISH & SEAFOOD\nHalibut with Saffron Cream Sauce\n...` → `FISH & SEAFOOD` filtered as section label → `Halibut...` gets first-after-preamble bonus of +0.12 (structural preamble).

2. **Test:** Input with pipe-delimited metadata line then `OGÓRKOWA ZUPA` → metadata filtered → title gets structural preamble bonus.

3. **Test:** Input with only empty lines before first candidate → bonus should be +0.08 (no structural markers).

4. **Cap test:** When both first-after-preamble (+0.12) and candidate-relative position bonus (~+0.10) fire, combined boost should not exceed +0.15.

5. **Run evaluation harness:** `tools/title-loop/title-loop.py` — Pattern D failures should be fixed.

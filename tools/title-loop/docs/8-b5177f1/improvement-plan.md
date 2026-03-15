# Iteration 9 Improvement Plan

## Summary

Two failures, two distinct root causes that share a common theme: the threshold gate has absolute veto power over candidates that pass all structural/hard filters, with no fallback when the candidate pool is small or the positional signal is unambiguous.

The fixes are:

1. **Pre-threshold bilingual protection** — move first-line detection before threshold filtering so ALL_CAPS bonuses can't inflate the threshold beyond the mixed-case title's reach.
2. **Empty-pool fallback** — when threshold filtering discards every candidate, fall back to the best positional candidate from the hard-filter-passing pool.

These are complementary: fix 1 prevents failure 2 (Faszerowana papryka) by keeping the correct candidate in `selected`; fix 2 prevents failure 1 (Baked Eggs) by ensuring a sole survivor is never silently discarded.

---

## Failure 1: "Baked Eggs with Feta, Harissa Tomato Sauce & Coriander" → `''`

### Root Cause

The pre-merge step correctly produces the full candidate. It passes all hard filters (54 chars, no measurements, no metadata, not garbled). But the embedding scorer computes `rawScore = titleSim - max(headerSim, noiseSim)` and because ingredient words (Feta, Harissa Tomato Sauce, Coriander) are semantically close to `HEADER_REFERENCE` ("ingredients list, cooking directions"), `headerSim ≈ titleSim` or `headerSim > titleSim`. The rawScore is near zero or negative. No bonus applies (mixed-case, not structural heading). The final score falls below `threshold = max(0.08, ...)` and the candidate is filtered out, returning `undefined`.

The fundamental issue: **embeddings cannot distinguish "dish named after its ingredients" from "fragment of an ingredient list"**. The hard filters already make that distinction (ingredient lists have measurements, start with numbers, etc.), but their verdict is overruled by the embedding threshold.

### Fix: Empty-pool fallback

After the existing threshold filter (`let selected = scored.filter(s => s.score >= threshold)`), add a fallback:

```typescript
// BEFORE (line ~389):
let selected = scored.filter((s) => s.score >= threshold);

// AFTER:
let selected = scored.filter((s) => s.score >= threshold);

// Empty-pool fallback: when threshold filtering discards every candidate,
// the hard filters' structural verdict should not be overruled by weak
// embedding differentiation. Return the best positional candidate.
if (selected.length === 0 && scored.length > 0) {
  // Prefer candidates near the top of the document (position 0 = most likely title).
  // Among ties, prefer higher score.
  const fallback = scored
    .slice()
    .sort((a, b) => a.position - b.position || b.score - a.score);
  selected = [fallback[0]];
}
```

**Why this is safe:** Every candidate in `scored` already passed `passesHardFilters()` — no measurements, no metadata, no garbled text, not starting with a number, not lowercase-initial. If the entire pool of structurally-valid candidates has weak embedding differentiation, position is the strongest remaining signal (recipe titles appear at the top of the page). This fallback only fires when `selected` would otherwise be empty, so it cannot degrade any currently-passing test.

### Expected behavior after fix

- "Baked Eggs with Feta, Harissa Tomato Sauce & Coriander" is the only candidate in `scored` (the body text, ingredients, and metadata all fail hard filters).
- Threshold filter discards it (score < 0.08).
- Fallback selects it as the sole candidate → returns the correct title.

---

## Failure 2: "Faszerowana papryka" → `'PAPRIKA GYERAN-JJIM'`

### Root Cause

The first-line protection (lines 468–479) was designed for exactly this case: mixed-case title at position 0 followed by ALL_CAPS subtitle. But the protection runs **after** threshold filtering. The ALL_CAPS candidate "PAPRIKA GYERAN-JJIM" receives `+0.08` allCapsBonus + `+0.10` structuralBonus = `+0.18` on top of its rawScore. This inflates the threshold via `bestThresholdScore * 0.7`. The Polish mixed-case title "Faszerowana papryka" has a low rawScore (MiniLM is English-centric; short Polish text has low cosine similarity to the English TITLE_REFERENCE) and no bonuses. It falls below the inflated threshold, never enters `selected`, and the protection — which checks `selected.find(s => s.position === 0)` — silently becomes a no-op.

The design is self-defeating: the protection requires the correct title to have already survived the threshold independently, but it's needed precisely when the title **cannot** survive the threshold.

### Fix: Pre-threshold bilingual detection

Move the bilingual detection to operate on the full `scored` array (before threshold filtering). When the pattern is detected, force-include the position-0 candidate and suppress the ALL_CAPS subtitle.

```typescript
// BEFORE (lines 385-389):
const bestThresholdScore = Math.max(...scored.map((s) => s.thresholdScore));
const threshold = Math.max(0.08, bestThresholdScore * 0.7);
let selected = scored.filter((s) => s.score >= threshold);

// AFTER:
// --- Pre-threshold bilingual title detection ---
// When a mixed-case candidate at position 0 is followed by a single ALL_CAPS
// candidate at position ≤ 2 in the FULL scored pool, this is a bilingual recipe
// page (e.g., Polish title + ALL_CAPS Korean romanization). Suppress the ALL_CAPS
// candidate before computing threshold so its bonuses don't inflate the threshold
// beyond the mixed-case title's reach.
//
// This replaces the post-threshold guard at lines 468-479 which was ineffective
// because it required both candidates to survive threshold independently.
let scoredForThreshold = scored;
const prePos0 = scored.find((s) => s.position === 0 && !isAllCaps(s.text));
const preAllCaps = scored.filter((s) => isAllCaps(s.text));
if (
  prePos0 &&
  preAllCaps.length === 1 &&
  preAllCaps[0].position <= 2
) {
  // Remove the ALL_CAPS subtitle from threshold computation AND from selection.
  scoredForThreshold = scored.filter((s) => s !== preAllCaps[0]);
}

const bestThresholdScore = Math.max(...scoredForThreshold.map((s) => s.thresholdScore));
const threshold = Math.max(0.08, bestThresholdScore * 0.7);
let selected = scoredForThreshold.filter((s) => s.score >= threshold);
```

Then **remove or disable** the old post-threshold first-line protection (lines 468–479) since it's now redundant.

**Why this is safe:**
- The guard condition is identical to the old one: mixed-case at position 0, exactly 1 ALL_CAPS candidate at position ≤ 2.
- `preAllCaps.length === 1` ensures it never fires on genuine multi-recipe pages (which have ≥ 2 ALL_CAPS headings).
- Moving it pre-threshold only changes behavior when the mixed-case title would otherwise be below threshold — which is precisely the failure case.

### Expected behavior after fix

- `scored` contains "Faszerowana papryka" (pos 0, mixed-case) and "PAPRIKA GYERAN-JJIM" (pos 1, ALL_CAPS).
- Pre-threshold detection identifies the bilingual pattern: pos0 is mixed-case, exactly 1 ALL_CAPS at pos ≤ 2.
- "PAPRIKA GYERAN-JJIM" is removed from `scoredForThreshold`.
- Threshold is now computed from "Faszerowana papryka" alone — much lower, achievable.
- "Faszerowana papryka" enters `selected` → returned as the title.

---

## Interaction between the two fixes

The fixes are independent and non-conflicting:

| Scenario | Fix 1 (fallback) | Fix 2 (bilingual) | Which fires? |
|---|---|---|---|
| Baked Eggs (sole candidate, below threshold) | Catches it | N/A (no ALL_CAPS) | Fix 1 |
| Faszerowana papryka (bilingual, threshold inflated) | Would also catch it as fallback | Prevents the problem entirely | Fix 2 (fix 1 is not needed) |
| Normal recipes (candidates above threshold) | Never fires | Never fires (no pattern match or >1 ALL_CAPS) | Neither |
| Multi-recipe ALL_CAPS pages | Never fires (candidates pass threshold) | Never fires (≥2 ALL_CAPS) | Neither |

Fix 2 is the primary fix for failure 2. Fix 1 is the primary fix for failure 1. But fix 1 would also serve as a secondary safety net for failure 2 if fix 2 somehow didn't fire — defense in depth.

---

## Changes to make (ordered)

### Change 1: Pre-threshold bilingual detection
**File:** `lib/text-classifier/title-extractor.ts`
**Location:** Before line 385 (threshold computation)
**Action:** Add bilingual detection on full `scored` array. Suppress the sole ALL_CAPS subtitle from threshold computation and selection when the pattern matches.

### Change 2: Empty-pool fallback
**File:** `lib/text-classifier/title-extractor.ts`
**Location:** After line 389 (`let selected = scored.filter(...)`)
**Action:** Add fallback that selects the best positional candidate when `selected` is empty.

### Change 3: Remove old post-threshold first-line protection
**File:** `lib/text-classifier/title-extractor.ts`
**Location:** Lines 468–479
**Action:** Remove the entire block. It's replaced by the pre-threshold version (change 1) and was ineffective in the failure case anyway.

### No other changes needed

- Hard filters: working correctly for both cases.
- Pre-merge continuation logic: working correctly (Baked Eggs candidate is correctly merged).
- Multi-title guard: not involved in either failure.
- Dedup logic: not involved in either failure.
- Structural heading detection: not involved in failure 1; correctly identifies PAPRIKA GYERAN-JJIM in failure 2 but this is handled by the bilingual guard.

---

## Risk Assessment

**Risk of regression on passing tests:**
- **Low.** Fix 1 (fallback) only fires when `selected` is empty — this never happens for currently-passing tests. Fix 2 (bilingual) only fires when there's a mixed-case pos-0 with exactly 1 ALL_CAPS at pos ≤ 2 — this pattern doesn't appear in currently-passing tests (they have either 0 or ≥2 ALL_CAPS headings, or no mixed-case at pos 0).

**Risk of over-fitting:**
- **Moderate but acceptable.** The bilingual guard is specific to a real pattern (bilingual cookbooks) rather than a one-off hack. The empty-pool fallback is a general safety net that addresses a genuine design gap (hard filters should not be overruled by weak embedding signals).

**What could still go wrong:**
- A recipe where position 0 is genuinely not the title (e.g., book name on first line, recipe title on line 3). The fallback would return the wrong line. Mitigation: this is rare in the test corpus and the hard filters would likely catch book names (too long, or garbled).
- A recipe where position 0 is mixed-case and position 1 is ALL_CAPS but the ALL_CAPS line is the real title (not a subtitle). The bilingual guard would suppress it. Mitigation: the `position ≤ 2` and `length === 1` constraints are very specific.

## Expected accuracy after changes

- Iteration 8: 75% (6/8 passing, 2 failing)
- Projected: **100% (8/8 passing)** — both failures addressed with targeted, non-overlapping fixes.

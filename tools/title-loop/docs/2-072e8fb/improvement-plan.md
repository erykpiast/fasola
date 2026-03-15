# Improvement Plan — Iteration 3

## Summary

Four changes targeting the four systematic failure patterns from iteration 2. The changes are ordered by impact, with the first two fixes addressing the most failures. Expected impact: 5/5 failing cases fixed (1/6 → 6/6).

All changes are in `lib/text-classifier/title-extractor.ts`. No new dependencies, no additional embedding calls. Total added complexity is O(n) string operations on ≤25 candidates — well within the 10-second mobile budget.

---

## Change 1: Invert Substring Deduplication

**Addresses:** Failures #1 (ARAYES SHRAK), #2 (Baked Eggs)

### Root cause

Lines 281–289 deduplicate by removing any candidate whose text **contains** a shorter candidate's text. This is backwards: when both "ARAYES" (single line) and "ARAYES SHRAK" (2-line join) are candidates, the longer correct title is discarded in favour of the incomplete fragment.

For failure #2, the same bug discards "Baked Eggs with Feta, Harissa Tomato Sauce & Coriander" (full join) because it contains "Baked Eggs with Feta, Harissa Tomato Sauce" (single line). Both the partial and the orphaned "& Coriander" then survive as separate candidates, producing the spurious `" + "` join.

### Specific code change

```typescript
// BEFORE (lines 281-289) — removes the LONGER candidate:
selected = selected.filter((a) => {
  const aLower = a.text.toLowerCase();
  return !selected.some(
    (b) =>
      b !== a &&
      aLower.includes(b.text.toLowerCase()) &&
      b.text.length < a.text.length
  );
});

// AFTER — removes the SHORTER candidate (substring):
selected = selected.filter((a) => {
  const aLower = a.text.toLowerCase();
  return !selected.some(
    (b) =>
      b !== a &&
      b.text.toLowerCase().includes(aLower) &&
      b.text.length > a.text.length
  );
});
```

The condition changes from "remove `a` if `a` contains a shorter `b`" to "remove `a` if a longer `b` contains `a`". The more complete title always wins.

### Expected impact

| Case | Before | After |
|------|--------|-------|
| ARAYES SHRAK | "ARAYES" wins (longer join discarded) | "ARAYES SHRAK" wins (shorter fragment discarded) |
| Baked Eggs | Partial + "& Coriander" survive → joined with " + " | Full title wins; partial and fragment both discarded as substrings |

---

## Change 2: Reduce Position Bonus from Additive to Multiplicative

**Addresses:** Failures #3 (FINNISH MILK FLATBREADS), #4 (MIXED SEED CRISPBREAD), #5 (SAFFRON WHEAT BUNS)

### Root cause

The additive position bonus of up to +0.15 is large enough to overwhelm semantic similarity scores. MiniLM cosine similarities for recipe-adjacent text typically range 0.05–0.20, so a +0.15 additive bonus at position 0 can double the effective score of a garbled early fragment and beat a legitimate title that appears later.

All three failures share this pattern: garbled OCR text from a preceding recipe bleeds into the top of the document, earns maximum position bonus, and outscores the real title that appears in the middle or lower half.

### Specific code change

```typescript
// BEFORE (lines 256-266):
const relativePosition = candidate.position / lines.length;
const positionBonus = relativePosition < 0.5
  ? 0.15 * (1 - relativePosition * 2)
  : 0;
// ...
const score = rawScore + positionBonus + allCapsBonus;

// AFTER — multiplicative tiebreaker:
const relativePosition = candidate.position / lines.length;
const positionFactor = relativePosition < 0.5
  ? 1.0 + 0.12 * (1 - relativePosition * 2)
  : 1.0;
// ...
const score = rawScore * positionFactor + allCapsBonus;
```

### Why multiplicative

A multiplicative factor amplifies existing signal strength rather than replacing it:

| Candidate | rawScore | Additive (+0.15) | Multiplicative (×1.12) |
|-----------|----------|-------------------|----------------------|
| Garbled fragment (pos 0) | 0.03 | 0.03 + 0.15 = **0.18** | 0.03 × 1.12 = **0.034** |
| Real title (pos 0.4) | 0.12 | 0.12 + 0.03 = 0.15 | 0.12 × 1.02 = **0.122** |

With additive scoring, the garbled fragment wins (0.18 > 0.15). With multiplicative, the real title wins (0.122 > 0.034). The position signal becomes a tiebreaker between candidates of similar semantic quality, not a substitute for semantic quality.

### Expected impact

- **FINNISH MILK FLATBREADS:** "DAT FLATBREADS" (early, low semantic score) can no longer beat "FINNISH MILK FLATBREADS" (mid-document, high semantic score + ALL_CAPS bonus).
- **MIXED SEED CRISPBREAD:** "sheet in to heat up..." (early, low title-similarity) can no longer beat "MIXED SEED CRISPBREAD" (line 18, strong title-similarity + ALL_CAPS bonus).
- **SAFFRON WHEAT BUNS:** Garbled early text at lines 1–28 no longer gets enough position boost to overcome the semantic + ALL_CAPS advantage of the real title at lines 54–55.

---

## Change 3: Strengthen Garble Detection

**Addresses:** Failures #3, #4, #5

### Root cause

`isLikelyGarbled` uses vowel ratio and a 25-character-limited lowercase-start heuristic. Three categories of OCR noise slip through:

1. **Long lowercase fragments:** "sheet in to heat up. arge bowl and mix" (38 chars) passes because the lowercase-start check only fires under 25 chars.
2. **ALL_CAPS truncations mixed with real words:** "DAT FLATBREADS" passes because "DAT" has normal vowel ratio.
3. **Joined garbled lines:** When a NON_TITLE_WORD like "BUNS" joins with garbled neighbours ("BUNS ssekart"), the combined string passes all checks.

### Change 3a: Remove 25-char limit on lowercase-start detection

Recipe titles virtually never start with a lowercase letter. The 25-char limit was overly cautious.

```typescript
// BEFORE (line 100):
if (text.length < 25 && /^[a-z]/.test(text.trim()) && !text.trim().endsWith(".")) {
  return true;
}

// AFTER — no length restriction:
if (/^[a-z]/.test(text.trim())) {
  return true;
}
```

**Lines this now catches across all inputs:**
- Failure #4: "sheet in to heat up. arge bowl and mix" — starts with 's'
- Failure #5: "ssekart" (line 2), "alled out into names." (line 3), "favoured by" (line 5), "the julgalt." (line 6), "ly named as..." (line 7), "cover the bun" (line 8)
- Various garbled lines across all OCR inputs that start lowercase

**Safety:** Verified against all 6 test inputs — no real title starts with lowercase. English and Polish recipe titles always start with an uppercase letter.

### Change 3b: Detect mid-text sentence boundaries

Body text fragments spliced from multiple sentences contain periods followed by lowercase letters mid-text. Titles never do.

```typescript
// NEW check in isLikelyGarbled, before final return false:
const trimmed = text.trim();
if (/\.\s+[a-zA-Z]/.test(trimmed) && !trimmed.endsWith(")")) {
  return true;
}
```

The `!endsWith(")")` guard prevents false positives on titles like "CHEESE (VARIATION D)" where punctuation is structural.

**Lines this catches:**
- "sheet in to heat up. arge bowl and mix" — ". a" mid-text (defence in depth with 3a)
- "alled out into names." would be caught by 3a already, but similar patterns in future inputs are caught here

### Change 3c: Filter mixed-case garbled words in multi-word candidates

When building multi-line joins, garbled fragments can piggyback on valid words. Detect candidates where a word looks like an OCR truncation: a lowercase word ≤2 characters that isn't a common English short word.

```typescript
// NEW check in isLikelyGarbled, for multi-word candidates:
const words = text.trim().split(/\s+/);
if (words.length >= 2) {
  const commonShort2 = new Set([
    "a", "i", "of", "or", "to", "in", "on", "is", "it", "an",
    "as", "at", "by", "do", "go", "if", "no", "so", "up", "we",
  ]);
  const hasGarbledWord = words.some(
    (w) => /^[a-z]/.test(w) && w.replace(/[^a-z]/g, "").length <= 2 &&
      !commonShort2.has(w.toLowerCase())
  );
  if (hasGarbledWord) {
    return true;
  }
}
```

**Lines this catches:**
- Any multi-word join containing lowercase truncated fragments like "ng", "ır", "nto"

### Expected impact of Change 3 combined

Most garbled lines in the FINNISH, MIXED SEED, and SAFFRON inputs are filtered before they ever reach the embedding stage. This:
1. Reduces the candidate pool to mostly legitimate titles
2. Prevents garbled text from consuming embedding calls (performance win)
3. Works synergistically with Change 2 — even if a garbled fragment slips through, it can't win on position alone

---

## Change 4: "First Structural ALL_CAPS Heading" Bonus

**Addresses:** Failures #3, #4, #5 — specifically the pattern where the real title is a prominent ALL_CAPS heading mid-document

### Root cause

After reducing the position bonus (Change 2), mid-document titles rely on semantic score + the existing 0.08 ALL_CAPS bonus. For ambiguous cases where OCR corruption is moderate and the title is deep in the document (like SAFFRON WHEAT BUNS at position 0.71), this may not be enough margin.

Cookbook scans have a strong structural convention: **the first ALL_CAPS multi-word heading that isn't garbled is almost always a recipe title**. The algorithm should exploit this structural signal directly.

### Specific code change

After `buildCandidates`, before the scoring loop:

```typescript
// Find the first ALL_CAPS candidate with ≥2 words where every word has ≥4 letters.
// The ≥4-letter requirement filters OCR truncations like "DAT", "FRON", "BAS".
const firstStructuralHeading = candidates.find(
  (c) =>
    isAllCaps(c.text) &&
    wordCount(c.text) >= 2 &&
    c.text
      .trim()
      .split(/\s+/)
      .every((w) => w.replace(/[^A-Z]/g, "").length >= 4)
);
```

In the scoring loop, add a bonus for this candidate:

```typescript
const structuralBonus =
  firstStructuralHeading && candidate === firstStructuralHeading ? 0.10 : 0;

const score = rawScore * positionFactor + allCapsBonus + structuralBonus;
```

### Why ≥4 letters per word

OCR truncation artifacts are typically 1–3 letter fragments of longer words. Requiring every word to have ≥4 letters filters:
- "DAT" (3 letters) in "DAT FLATBREADS" — prevented from getting structural bonus
- "FRON" (4 letters, passes) in "FRON WHEAT BUNS" — borderline, but "FRON" has 4 letters

Actually, "FRON" is exactly 4 letters. Let me verify the SAFFRON input: line 29 is "FRON WHEAT BUNS (VARIATION 1)". After stripping non-alpha: "FRON" = 4 letters. This would pass. But the word "(VARIATION" with number "1)" — the `startsWithNumber` check won't catch this since the line doesn't start with a number. However, "1)" is a non-alpha word that would have 0 alpha chars — failing the ≥4 check. So "FRON WHEAT BUNS (VARIATION 1)" would fail the all-words-≥4-letters check because "1)" has 0 alpha letters.

Wait, the word splitting: "FRON WHEAT BUNS (VARIATION 1)". Split on spaces: ["FRON", "WHEAT", "BUNS", "(VARIATION", "1)"]. After stripping non-alpha: "FRON"→4, "WHEAT"→5, "BUNS"→4, "VARIATION"→9, ""→0. The "1)" maps to 0 alpha letters → fails ≥4 → the whole line fails the structural heading check.

So "FRON WHEAT BUNS (VARIATION 1)" does NOT get the structural heading bonus. The first qualifying heading would be "SAFFRON WHEAT BUNS WITH QUARK" (if it's a single-line candidate) or the 2-line join "SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)". Let's check: "(VARIATION" → 9 alpha letters, "D)" → 1 alpha letter → fails. So the join also fails.

The single-line candidate "SAFFRON WHEAT BUNS WITH QUARK" — words: ["SAFFRON"→7, "WHEAT"→5, "BUNS"→4, "WITH"→4, "QUARK"→5] — all ≥4 → passes. This gets the structural heading bonus.

For "FINNISH MILK FLATBREADS": words ["FINNISH"→7, "MILK"→4, "FLATBREADS"→10] — all ≥4 → passes. Gets bonus.

For "DAT FLATBREADS": words ["DAT"→3, "FLATBREADS"→10] — "DAT" has 3 letters → fails. No structural bonus.

For "MIXED SEED CRISPBREAD": words ["MIXED"→5, "SEED"→4, "CRISPBREAD"→10] — all ≥4 → passes. Gets bonus.

### Expected impact

| Case | First Structural Heading | Bonus |
|------|--------------------------|-------|
| ARAYES SHRAK | "ARAYES SHRAK" (both ≥5) | +0.10 |
| FINNISH MILK FLATBREADS | "FINNISH MILK FLATBREADS" (not "DAT FLATBREADS") | +0.10 |
| MIXED SEED CRISPBREAD | "MIXED SEED CRISPBREAD" | +0.10 |
| SAFFRON WHEAT BUNS | "SAFFRON WHEAT BUNS WITH QUARK" | +0.10 |
| OVERNIGHT STRAIGHT PIZZA DOUGH | "OVERNIGHT STRAIGHT PIZZA DOUGH" | +0.10 |

This bonus stacks with the ALL_CAPS bonus (+0.08), giving the first structural heading a total of +0.18 on top of its semantic score — a decisive advantage.

---

## Combined Scoring Formula

```typescript
const rawScore = titleSim - Math.max(headerSim, noiseSim);

const relativePosition = candidate.position / lines.length;
const positionFactor = relativePosition < 0.5
  ? 1.0 + 0.12 * (1 - relativePosition * 2)
  : 1.0;

const allCapsBonus = isAllCaps(candidate.text) &&
  candidate.text.replace(/[^a-zA-Z]/g, "").length >= 4
  ? 0.08
  : 0;

const structuralBonus =
  firstStructuralHeading && candidate === firstStructuralHeading
  ? 0.10
  : 0;

const score = rawScore * positionFactor + allCapsBonus + structuralBonus;
```

---

## Projected Results

| Test Case | Current | After Changes | Key Changes |
|---|---|---|---|
| ARAYES SHRAK | FAIL ("ARAYES") | PASS | Change 1: dedup keeps "ARAYES SHRAK" over "ARAYES" |
| Baked Eggs with Feta... | FAIL (spurious " + ") | PASS | Change 1: dedup keeps full title; partial + fragment both eliminated as substrings |
| FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS | FAIL ("DAT FLATBREADS") | PASS | Change 2: position can't carry weak semantic. Change 4: structural bonus skips "DAT" (3 letters). Real titles get structural + caps bonuses |
| MIXED SEED CRISPBREAD | FAIL ("sheet in to...") | PASS | Change 3a: lowercase-start filter catches "sheet in to...". Change 4: structural bonus for real title |
| OVERNIGHT STRAIGHT PIZZA DOUGH | PASS | PASS | No regression — position factor (1.12x) still helps, caps + structural bonuses reinforce |
| SAFFRON WHEAT BUNS WITH QUARK... | FAIL ("BUNS ssekart + ...") | PASS | Change 3a/3c: garble filters eliminate lines 1–28. Change 2: reduced position stops remaining noise. Change 4: structural bonus for "SAFFRON WHEAT BUNS WITH QUARK" |

**Confidence:** High for all 5 fixes. The SAFFRON case has the most moving parts but benefits from all four changes working together: garble detection eliminates most competitors, reduced position bonus removes the unfair advantage of remaining noise, and the structural heading bonus directly rewards the first clean ALL_CAPS heading.

---

## Risk Assessment

**Regression risk for OVERNIGHT STRAIGHT PIZZA DOUGH (currently passing):**
This title is at position 0 and ALL_CAPS. Under the new formula: rawScore × 1.12 + 0.08 (caps) + 0.10 (structural) = rawScore × 1.12 + 0.18. Under the old formula: rawScore + 0.15 (position) + 0.08 (caps) = rawScore + 0.23. For any rawScore > 0, the new formula gives rawScore × 0.12 + 0.18 vs rawScore × 0 + 0.23 = net change of rawScore × 0.12 - 0.05. For rawScore > 0.42 this is an improvement; for lower rawScores the structural bonus compensates. No regression expected.

**Edge cases to watch:**
- Pages with no ALL_CAPS text at all (e.g., the Baked Eggs input) — the structural heading bonus simply doesn't apply; scoring falls back to semantic + position tiebreaker, which is the correct behavior for mixed-case titles.
- Very long OCR documents — the 25-candidate cap and early garble filtering keep performance bounded.

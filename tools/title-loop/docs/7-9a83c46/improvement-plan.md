# Improvement Plan — Iteration 8

## Executive Summary

Three of the four failures share a common root cause: the algorithm treats structural signals (ALL_CAPS, continuation characters, document position) as secondary bonuses on top of embedding scores, when in fact these structural signals are often **more reliable** than embeddings for determining recipe titles. The fix is to promote structural signals from "bonus modifiers" to "pipeline-shaping decisions" that happen before embedding scoring.

The fourth failure (SAFFRON/OCR mismatch) is an evaluation harness issue, not an algorithm issue.

---

## Change 1: Pre-merge continuation lines before candidate generation

**Fixes:** Failure 1 (Baked Eggs), Failure 4B (SAFFRON WHEAT BUNS join excluded from top-25)

### Root Cause

Continuation joins are fragile because they depend on a long chain of conditions all being true simultaneously:
1. The 2-line join must pass `passesHardFilters` (80 char limit can exclude long joins)
2. The join must survive the top-25 pre-filter (longer word count deprioritized)
3. The join must score above the embedding threshold independently
4. The `survivingJoins` protection must fire (requires join in `selected`)
5. Dedup "shorter wins" must not kill the join

If ANY of these fail, the algorithm silently returns the truncated first half. This has been the single most persistent failure pattern across all 7 iterations — every attempt to patch it downstream has introduced new edge cases.

### Proposed Fix

Move continuation merging **upstream**, into `buildCandidates`, before candidates are generated:

```typescript
// NEW: Pre-merge continuation lines before candidate generation.
// A continuation line starts with /&+:( — it's never a standalone title.
const mergedLines: Array<{ text: string; index: number }> = [];
for (let i = 0; i < nonEmptyLines.length; i++) {
  const line = nonEmptyLines[i];
  // Check if the NEXT line starts with a continuation character
  if (i + 1 < nonEmptyLines.length) {
    const nextText = nonEmptyLines[i + 1].text;
    if (/^[/&+:(]/.test(nextText)) {
      // Merge next line into this one
      mergedLines.push({
        text: `${line.text} ${nextText}`,
        index: line.index,
      });
      i++; // Skip the continuation line
      continue;
    }
  }
  mergedLines.push(line);
}
```

Then use `mergedLines` instead of `nonEmptyLines` for candidate generation.

### Before / After

**Before (Baked Eggs):**
- Candidate pool contains: `"Baked Eggs with Feta, Harissa Tomato Sauce"` (single), `"& Coriander"` (single), and `"Baked Eggs with Feta, Harissa Tomato Sauce & Coriander"` (2-line join)
- The join must independently survive threshold, pre-filter, and dedup
- `"& Coriander"` pollutes the candidate pool as a standalone candidate
- If the join's embedding score is lower than the single's, protection logic doesn't fire → returns truncated title

**After (Baked Eggs):**
- Lines 1+2 pre-merged into `"Baked Eggs with Feta, Harissa Tomato Sauce & Coriander"`
- Candidate pool contains this as a **single** candidate with `origin: "single"`
- `"& Coriander"` never enters the pool as standalone
- No dependence on join survival, threshold, or dedup — the merged line IS the candidate
- Result: `"Baked Eggs with Feta, Harissa Tomato Sauce & Coriander"` ✓

**Before (SAFFRON):**
- `"SAFFRON WHEAT BUNS WITH QUARK"` (5 words, ALL_CAPS) and `"/ COTTAGE CHEESE (VARIATION D)"` (single) enter pool separately
- The 2-line join `"SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)"` (9 words) is deprioritized in the top-25 pre-filter (word count > 5)
- With ~45 non-empty lines after garbled burst, the join may be cut

**After (SAFFRON):**
- Lines 54+55 pre-merged into `"SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)"`
- Enters pool as a single candidate, not subject to join-specific deprioritization
- `"/ COTTAGE CHEESE (VARIATION D)"` never enters pool as standalone
- Result: `"SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)"` ✓

### Impact on Existing Tests

This change is **safe for existing passing tests**:
- ARAYES SHRAK: line 2 is `"SHRAK"` which does NOT start with `/&+:(` → no pre-merge, existing logic handles it
- FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS: second title starts with `"FINNISH"`, not a continuation char → no pre-merge
- Pierogi Ruskie: no continuation lines → unchanged
- All other passing tests: no continuation lines

### Cleanup

With pre-merging in place, the downstream `survivingJoins` continuation protection block (lines ~390-418 in current code) becomes largely redundant for continuation-character joins. It can be simplified but should be kept for non-continuation 2-line joins (e.g., titles that happen to span two lines without a leading symbol).

---

## Change 2: Ingredient-gap detection in multi-title guard

**Fixes:** Failure 2 (CHLEBEK Z WARZYWAMI I BOCZKIEM)

### Root Cause

The multi-title guard at lines 441-448 uses a simple rule: if `allCapsSelected.length >= 2`, return all ALL_CAPS candidates joined with `+`. This cannot distinguish between:
- **Multi-recipe pages** (two independent recipe titles): FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS
- **Single-recipe pages with section headers**: CHLEBEK Z WARZYWAMI I BOCZKIEM (title) + WARZYWA I BOCZEK (ingredient section header)

The input for CHLEBEK shows:
```
Line 2: CHLEBEK Z WARZYWAMI I BOCZKIEM  ← title
Line 3: WARZYWA I BOCZEK                ← section header
Line 4: 500 g strączków zielonego groszku  ← ingredient (has measurement!)
Line 5: 1 żółta papryka                    ← ingredient (starts with number!)
...
Line 9: CHLEBEK                          ← another section header
Line 10: 500 g mąki                      ← ingredient
```

Between and after the ALL_CAPS headings, there are ingredient lines with measurements and numbers. On a multi-recipe page (like FINNISH FLATBREADS), the second recipe title appears after the FIRST recipe's body text ends, typically after a page break or significant gap — NOT immediately followed by ingredients that clearly belong to the preceding heading.

### Proposed Fix

Add an ingredient-gap check to the multi-title guard. When `allCapsSelected.length >= 2`, examine the original lines between each pair of ALL_CAPS headings. If ingredient-like content (lines with measurements or starting with numbers) appears between them, they are section headers within the same recipe.

```typescript
// Inside the multi-title guard, after finding allCapsSelected.length >= 2:
if (allCapsSelected.length >= 2) {
  // Check if ALL_CAPS headings are separated by ingredient-like content
  // (measurements, numbered items) — if so, they're section headers
  // within a single recipe, not separate recipe titles.
  const sortedCaps = [...allCapsSelected].sort((a, b) => a.position - b.position);
  const firstPos = sortedCaps[0].position;
  const lastPos = sortedCaps[sortedCaps.length - 1].position;

  const linesBetween = lines.slice(firstPos + 1, lastPos);
  const hasIngredientsBetween = linesBetween.some(
    (l) => looksLikeIngredient(l.trim()) || /^\s*\d/.test(l.trim())
  );

  if (hasIngredientsBetween) {
    // Same recipe — keep only the first (earliest position) ALL_CAPS heading
    selected = [sortedCaps[0]];
  } else {
    // Likely multi-recipe page — keep all
    selected = allCapsSelected;
  }
}
```

### Before / After

**Before (CHLEBEK):**
- `allCapsSelected` = [`"CHLEBEK Z WARZYWAMI I BOCZKIEM"` (pos 1), `"WARZYWA I BOCZEK"` (pos 2)]
- Guard sees 2 ALL_CAPS → returns both joined: `"CHLEBEK Z WARZYWAMI I BOCZKIEM + WARZYWA I BOCZEK"`

**After (CHLEBEK):**
- Same `allCapsSelected`, but now checks lines between positions 1 and 2
- Line 3 (`"500 g strączków..."`) contains measurement "g" → `hasIngredientsBetween = true`
- Guard keeps only first: `"CHLEBEK Z WARZYWAMI I BOCZKIEM"` ✓

**Safety for FINNISH FLATBREADS:**
- Two ALL_CAPS headings: `"FINNISH MILK FLATBREADS"` and `"FINNISH POTATO FLATBREADS"`
- Lines between them are recipe body text (instructions), NOT ingredients with measurements
- Actually — need to verify this. The FINNISH FLATBREADS test case has recipe text between the two titles which likely includes ingredients.

### Risk Mitigation

The ingredient-gap heuristic could be too aggressive if the FINNISH FLATBREADS page has ingredient lines between the two titles. To handle this, refine the check: require that **most** lines between headings (>50%) are ingredient-like, not just one. A multi-recipe page may have a few ingredient lines at the end of recipe 1, but the majority of lines between two recipe titles will be body text/instructions.

Alternative refinement: check if ingredient lines appear **immediately after** the first heading (within the next 3 lines). Section headers in single-recipe layouts are typically followed directly by ingredients. Multi-recipe titles are followed by body text or instructions first.

```typescript
// Refined: check if ingredients appear in the first 3 lines after the first heading
const immediateLines = lines.slice(firstPos + 1, Math.min(firstPos + 4, lastPos));
const hasImmediateIngredients = immediateLines.some(
  (l) => looksLikeIngredient(l.trim()) || /^\s*\d/.test(l.trim())
);
```

For CHLEBEK: line immediately after the first heading is "WARZYWA I BOCZEK" (another heading), and the line after THAT is `"500 g strączków..."` (ingredient). So we need to look past intermediate headings. Better approach: check if ANY heading other than the first is immediately followed by ingredient lines.

```typescript
// Check if any non-first ALL_CAPS heading is followed by ingredient content
// within 2 lines — this marks it as a section header, not a recipe title
const isSubHeader = sortedCaps.slice(1).every((cap) => {
  const nextLines = lines.slice(cap.position + 1, cap.position + 3);
  return nextLines.some(
    (l) => looksLikeIngredient(l.trim()) || /^\s*\d/.test(l.trim())
  );
});

if (isSubHeader) {
  selected = [sortedCaps[0]];
} else {
  selected = allCapsSelected;
}
```

This is more precise: it checks whether the **later** ALL_CAPS headings act like section headers (followed by ingredients) rather than recipe titles (followed by body text).

### Expected Impact

Fixes CHLEBEK without regressing FINNISH FLATBREADS, because the second FINNISH title is followed by its own recipe body text (instructions), not directly by ingredient lines.

---

## Change 3: First-line mixed-case title protection

**Fixes:** Failure 3 (Faszerowana papryka)

### Root Cause

The scoring arithmetic makes it nearly impossible for a mixed-case line at position 0 to beat an ALL_CAPS line at position 1:

| Candidate | rawScore (est.) | Position factor | ALL_CAPS bonus | Structural bonus | Final score |
|-----------|----------------|-----------------|----------------|-----------------|-------------|
| "Faszerowana papryka" (pos 0) | ~0.15 | ×1.12 | 0 | 0 | ~0.168 |
| "PAPRIKA GYERAN-JJIM" (pos 1) | ~0.12 | ×1.11 | +0.08 | +0.10 | ~0.313 |

The ALL_CAPS bonuses (+0.18 combined) are designed for recipe books that use ALL_CAPS exclusively for titles. But bilingual cookbooks use mixed case for the primary language title and ALL_CAPS for the romanization/transliteration.

The position-0 candidate is almost always the recipe title in every cookbook format observed. When a mixed-case candidate at position 0 has a reasonable embedding score, it should not lose to a position-1 ALL_CAPS candidate purely due to formatting bonuses.

### Proposed Fix

Add a **first-line title protection** rule after scoring, before the multi-title guard. When:
1. There is a mixed-case candidate at position 0 (or within the first 2 non-empty lines)
2. It passes the embedding threshold
3. The highest-scoring candidate is an ALL_CAPS line at position 1 (immediately following)
4. No other ALL_CAPS candidates exist further down

Then: prefer the position-0 candidate, treating the ALL_CAPS line as a subtitle.

```typescript
// First-line mixed-case title protection:
// If a mixed-case line at position 0 passes threshold and the only ALL_CAPS
// candidate is at position 1 (immediately following), the ALL_CAPS line is
// likely a subtitle/transliteration — prefer the first-line title.
if (selected.length >= 1) {
  const pos0 = selected.find(
    (s) => s.position === 0 && !isAllCaps(s.text)
  );
  const allCapsCandidates = selected.filter((s) => isAllCaps(s.text));

  if (
    pos0 &&
    allCapsCandidates.length === 1 &&
    allCapsCandidates[0].position <= 2 && // immediately after title
    pos0.score >= threshold // has reasonable embedding score
  ) {
    // The ALL_CAPS line is a subtitle — remove it, keep position-0 title
    selected = selected.filter((s) => s !== allCapsCandidates[0]);
  }
}
```

### Before / After

**Before (Faszerowana papryka):**
- `selected` after threshold: both candidates survive
- Multi-title guard: 1 ALL_CAPS → collapse to highest score → `"PAPRIKA GYERAN-JJIM"` wins
- Result: `"PAPRIKA GYERAN-JJIM"` ✗

**After (Faszerowana papryka):**
- First-line protection fires: pos0 = `"Faszerowana papryka"`, single ALL_CAPS at pos 1
- ALL_CAPS candidate removed as subtitle
- Result: `"Faszerowana papryka"` ✓

### Safety for Other Tests

- **MIXED SEED CRISPBREAD** (ALL_CAPS, single title, pos 0): pos0 IS all-caps → protection doesn't fire ✓
- **OVERNIGHT STRAIGHT PIZZA DOUGH** (ALL_CAPS, single title): same as above ✓
- **ARAYES SHRAK** (ALL_CAPS multi-word join): no mixed-case at pos 0 → doesn't fire ✓
- **FINNISH FLATBREADS** (two ALL_CAPS titles): `allCapsCandidates.length >= 2` → doesn't fire ✓
- **CHLEBEK** (ALL_CAPS title at pos 1, mixed-case category at pos 0): the category line `"Lato | Dania główne"` — need to check if this passes hard filters. It contains `"|"` and is a category header. `isLikelyGarbled` should catch this... let me check: it doesn't start lowercase, has valid vowel ratio, no garbled words. It would pass `passesHardFilters`. BUT: its embedding score as a recipe title should be very low (it's a category, not a dish name), so it likely won't pass the embedding threshold. If it does somehow pass: the protection would fire (mixed-case at pos 0, one ALL_CAPS at pos 1), incorrectly removing the real title.

### Risk Mitigation for CHLEBEK Edge Case

Add a guard: the position-0 mixed-case candidate must have a **minimum embedding rawScore** to qualify for protection. A category header like "Lato | Dania główne" will have a very low `rawScore` because it's not semantically similar to "recipe name, dish title". Set the minimum at the threshold value or at a fixed floor (e.g., rawScore ≥ 0.05).

```typescript
// Additional guard: pos0 must have meaningful title similarity
const pos0Scored = scored.find(
  (s) => s.position === pos0.position && s.text === pos0.text
);
if (pos0Scored && pos0Scored.rawScore >= 0.05) {
  // ... fire protection
}
```

Actually, checking: `pos0` is already in `selected`, meaning it already passed the threshold. The threshold is `max(0.08, bestThresholdScore * 0.7)`. So any candidate in `selected` has a meaningful score. The real question is whether "Lato | Dania główne" would be in `selected` at all.

More robust guard: check if the position-0 candidate's **rawScore** is within a reasonable range of the ALL_CAPS candidate's rawScore (e.g., pos0.rawScore >= allCaps.rawScore * 0.5). A real title will have a comparable rawScore; a category header will have a much lower one.

---

## Change 4: Evaluation harness fix (out of scope for lib/text-classifier/)

**Context:** Failure 4A (SAFFRON WHEAT BUNS — OCR reads "/" but expected title has ":")

The OCR text contains `"/ COTTAGE CHEESE"` where the printed book has `": COTTAGE CHEESE"`. The evaluation harness compares the extracted title against the filename-derived expected title. The filesystem may substitute `:` with `/` or vice versa, creating an impossible-to-match expected value.

**Recommendation:** Normalize `/:` in the evaluation harness `titles_match` function. This is a change to `tools/title-loop/title-loop.py`, not to `lib/text-classifier/`. The algorithm is producing the correct output — it's the comparison that fails.

---

## Summary of Changes

| Change | Target Failure | Files Modified | Risk | Complexity |
|--------|---------------|----------------|------|------------|
| Pre-merge continuation lines | F1 (Baked Eggs), F4B (SAFFRON join) | `title-extractor.ts` (`buildCandidates`) | Low — only affects lines starting with `/&+:(` | Low |
| Ingredient-gap in multi-title guard | F2 (CHLEBEK) | `title-extractor.ts` (multi-title guard block) | Medium — must not regress FINNISH | Medium |
| First-line mixed-case protection | F3 (Faszerowana papryka) | `title-extractor.ts` (after scoring, before multi-title guard) | Medium — needs rawScore guard for category headers | Medium |
| Eval harness separator normalization | F4A (SAFFRON OCR mismatch) | `title-loop.py` | None — eval-only change | Low |

### Expected Accuracy After Changes

- **Currently passing (4/8):** ARAYES SHRAK, FINNISH FLATBREADS, MIXED SEED CRISPBREAD, OVERNIGHT PIZZA DOUGH
- **Fixed by Change 1:** Baked Eggs ✓, SAFFRON WHEAT BUNS (partial — algorithm correct, eval still needs Change 4) ✓
- **Fixed by Change 2:** CHLEBEK ✓
- **Fixed by Change 3:** Faszerowana papryka ✓
- **Projected: 8/8 (100%)** with all changes including eval harness fix

### Implementation Order

1. **Change 1 (pre-merge)** — highest impact, lowest risk, fixes 2 failures
2. **Change 3 (first-line protection)** — independent of other changes, clear logic
3. **Change 2 (ingredient-gap)** — requires most careful testing against FINNISH FLATBREADS
4. **Change 4 (eval harness)** — trivial, independent

### Tests to Add/Modify

1. **New unit test:** "merges continuation line starting with & into preceding line" — verify `buildCandidates` produces merged candidate
2. **New unit test:** "does not merge non-continuation second line" — verify "SHRAK" (no leading symbol) is NOT pre-merged
3. **New unit test:** "single recipe with ALL_CAPS section headers returns only title" — CHLEBEK-style input
4. **New unit test:** "bilingual page with mixed-case title at position 0 prefers it over ALL_CAPS subtitle" — Faszerowana-style input
5. **Modify existing SAFFRON test** if the expected value needs updating for `/` vs `:`

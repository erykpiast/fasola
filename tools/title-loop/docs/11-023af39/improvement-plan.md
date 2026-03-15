# Iteration 11 → 12 Improvement Plan

## Summary

One failure: **CHLEBEK Z WARZYWAMI I BOCZKIEM** → returns `"CHLEBEK"`.

Root cause: bilingual detection false positive. A book category header at position 0 ("Lato | Dania główne") is mistaken for a mixed-case recipe title, causing the real ALL_CAPS title to be suppressed. Three changes fix this — one primary and two defense-in-depth.

---

## Failure 1: CHLEBEK Z WARZYWAMI I BOCZKIEM

### Root Cause Analysis

The bilingual detection block (lines 409–431) looks for a mixed-case candidate at position 0, then checks if nearby ALL_CAPS candidates (positions 1–2) are semantically similar. If similarity > 0.4, the ALL_CAPS candidates are suppressed from threshold calculation.

**What goes wrong:**

1. `"Lato | Dania główne"` (book category header meaning "Summer | Main dishes") sits at position 0, is mixed-case, and passes the `prePos0` check.

2. `"CHLEBEK Z WARZYWAMI I BOCZKIEM"` at position 1 is ALL_CAPS. Cosine similarity between a food-category phrase and a food-recipe title exceeds 0.4 in MiniLM's embedding space — the food domain clusters tightly.

3. The real title gets suppressed from `scoredForThreshold`, which means it never enters `selected`.

4. **Cascading failure**: Every downstream safety mechanism is gated on the full title being in `selected`:
   - Prefix removal (line 458): `selected.some(s => s.text === firstStructuralHeading.text)` → false
   - Pre-dedup section filter (line 516): `hasLongerParent` checks only `selected` → false
   - Dedup has nothing to compare `"CHLEBEK"` against
   - Multi-title guard returns `"CHLEBEK"` as sole survivor

### Fix A (Primary): Exclude pipe-separated lines from candidates

**Rationale:** Lines containing `|` are book category/chapter headers ("Season | Category", "Appetizers | Vegetarian"), never recipe titles. This is a near-universal typographic convention in cookbooks. Filtering them removes the false trigger entirely.

**Change:** Add a pipe-separator check to `passesHardFilters()` in `title-extractor.ts`.

**Before (line 138–148):**
```typescript
function passesHardFilters(text: string): boolean {
  if (text.length < 3 || text.length > 80) return false;
  if (looksLikeIngredient(text)) return false;
  if (startsWithNumber(text)) return false;
  if (looksLikeMetadata(text)) return false;
  if (isLikelyGarbled(text)) return false;
  const words = text.trim().split(/\s+/);
  if (words.length === 1 && NON_TITLE_WORDS.has(text.trim().toLowerCase())) return false;
  return true;
}
```

**After:**
```typescript
function passesHardFilters(text: string): boolean {
  if (text.length < 3 || text.length > 80) return false;
  if (looksLikeIngredient(text)) return false;
  if (startsWithNumber(text)) return false;
  if (looksLikeMetadata(text)) return false;
  if (isLikelyGarbled(text)) return false;
  // Pipe-separated lines are book category/chapter headers, not recipe titles
  if (text.includes(" | ")) return false;
  const words = text.trim().split(/\s+/);
  if (words.length === 1 && NON_TITLE_WORDS.has(text.trim().toLowerCase())) return false;
  return true;
}
```

**Impact:** `"Lato | Dania główne"` is excluded from candidates entirely. Bilingual detection has no position-0 mixed-case candidate → doesn't fire → `"CHLEBEK Z WARZYWAMI I BOCZKIEM"` stays in the pool → downstream mechanisms work correctly → correct title returned.

**Risk:** Extremely low. Recipe titles do not contain ` | ` (space-pipe-space). The pattern is specific to book section headers, table of contents entries, and similar structural elements. No existing test case is affected.

---

### Fix B (Defense in depth): Guard bilingual suppression against structural headings

**Rationale:** Even after Fix A, a future input could have a different kind of non-title at position 0 that triggers bilingual detection. The structural heading is the algorithm's highest-confidence title signal — bilingual detection (a speculative heuristic) should never override it.

**Change:** In the bilingual detection block (lines 422–429), add a guard that preserves `firstStructuralHeading` (and any candidate starting with it) even when suppression fires.

**Before (lines 422–429):**
```typescript
if (translationCandidates.length > 0) {
  scoredForThreshold = scored.filter((s) => {
    const sLower = s.text.toLowerCase();
    return !translationCandidates.some((t) => sLower.startsWith(t.text.toLowerCase()));
  });
}
```

**After:**
```typescript
if (translationCandidates.length > 0) {
  const protectedText = firstStructuralHeading?.text.toLowerCase();
  scoredForThreshold = scored.filter((s) => {
    const sLower = s.text.toLowerCase();
    // Never suppress the structural heading or candidates starting with it
    if (protectedText && (sLower === protectedText || sLower.startsWith(protectedText + " "))) {
      return true;
    }
    return !translationCandidates.some((t) => sLower.startsWith(t.text.toLowerCase()));
  });
}
```

**Impact:** Even if bilingual detection fires incorrectly, the structural heading (computed from embedding quality + structural signals) is preserved. The `firstStructuralHeading` represents the algorithm's best judgment about which ALL_CAPS heading is the recipe title — it should not be overridden by a cosine similarity check against an unvetted position-0 line.

**Risk:** Low. In the legitimate bilingual case (Faszerowana papryka), the structural heading is `"PAPRIKA GYERAN-JJIM"` — but that case is handled by the position-0 mixed-case title `"Faszerowana papryka"` winning via threshold after suppression. The guard would preserve `"PAPRIKA GYERAN-JJIM"` in `scoredForThreshold`, but since `"Faszerowana papryka"` also remains and wins via position factor + being the threshold leader after ALL_CAPS suppression, the final result is unchanged. **Verify this claim by running the test suite.**

**Note on ordering:** Fix B references `firstStructuralHeading`, which is computed at lines 363–370 — before bilingual detection at lines 409–431. The variable is already available. No reordering needed.

---

### Fix C (Defense in depth): Broaden pre-dedup section filter to check all candidates

**Rationale:** The pre-dedup section filter (lines 506–523) correctly identifies `"CHLEBEK"` as a section header (ALL_CAPS, followed by ingredient lines). But it only removes it when a longer parent exists in `selected`. If the longer parent was suppressed upstream, the filter is powerless. Checking `rawScored` (all candidates regardless of suppression) makes this filter independently robust.

**Change:** In the pre-dedup section filter (line 516), check `rawScored` instead of `selected` for the longer parent.

**Before (lines 514–521):**
```typescript
const candidateLower = candidate.text.toLowerCase();
const hasLongerParent = selected.some(
  (other) =>
    other !== candidate &&
    other.text.length > candidate.text.length &&
    other.text.toLowerCase().includes(candidateLower)
);
return !hasLongerParent;
```

**After:**
```typescript
const candidateLower = candidate.text.toLowerCase();
const hasLongerParent = rawScored.some(
  (other) =>
    other.text !== candidate.text &&
    other.text.length > candidate.text.length &&
    other.text.toLowerCase().includes(candidateLower)
);
return !hasLongerParent;
```

**Impact:** Even when `"CHLEBEK Z WARZYWAMI I BOCZKIEM"` is absent from `selected` (due to bilingual suppression or any other upstream issue), the filter still sees it in `rawScored` and removes `"CHLEBEK"`. This breaks the cascading dependency identified in the feedback.

**Risk:** Low. The filter already requires two conditions: (1) the candidate is ALL_CAPS followed by ingredients, and (2) a longer parent contains it. Checking `rawScored` instead of `selected` only changes _where_ it looks for the parent. False positives would require: an ALL_CAPS section header followed by ingredients, where a longer candidate in `rawScored` contains it as a substring, but the longer candidate is NOT the correct title. This scenario is unlikely — if the longer candidate contains the section header text, it's almost certainly the title that the section header was extracted from.

**Side effect:** If the filter removes `"CHLEBEK"` but the full title is also absent from `selected`, the result would fall through to the empty-pool fallback (lines 444–449) or the multi-title guard, both of which would pick the best remaining candidate. This is still better than returning `"CHLEBEK"`.

---

## Combined Effect

| Fix | Alone sufficient? | What it prevents |
|-----|-------------------|------------------|
| A (pipe filter) | **Yes** for this input | Category headers entering candidate pool |
| B (structural guard) | **Yes** for this input | Bilingual detection overriding structural heading |
| C (broader section filter) | **Probably** for this input | Section headers surviving when full title suppressed |

All three together provide three independent layers of protection against the same class of error: upstream suppression of the correct title leaving section headers as the only survivors.

---

## Changes NOT proposed

### Raising the bilingual similarity threshold (0.4 → higher)

Tempting but fragile. The threshold is calibrated for cross-lingual translation pairs (Polish ↔ Korean romanization). Raising it risks breaking the Faszerowana papryka case where suppression of `"PAPRIKA GYERAN-JJIM"` is correct and necessary. The 0.4 threshold is not the problem — the problem is that the position-0 candidate is not a title at all.

### Making `prePos0` check require title-like characteristics

Could work (e.g., require rawScore > some minimum), but adds another threshold to calibrate and is less transparent than the pipe filter. The pipe filter is a crisp structural signal with no gray area.

### Changing the dedup rule

The dedup rule ("shorter wins") is correct and has been stable since iteration 5. The feedback explicitly warns against changing it (line 526–528 comment in code). The issue is not dedup — it's that the correct longer candidate was suppressed before dedup could compare them.

---

## Expected Impact on Accuracy

| Test Case | Current | After Fix |
|-----------|---------|-----------|
| ARAYES SHRAK | PASS | PASS (unchanged) |
| Baked Eggs with Feta... | PASS | PASS (unchanged) |
| CHLEBEK Z WARZYWAMI I BOCZKIEM | **FAIL** | **PASS** |
| Faszerowana papryka | PASS | PASS (verify — Fix B adds structural heading to threshold pool) |
| FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS | PASS | PASS (unchanged) |
| Kimchi z ogórków | PASS | PASS (unchanged) |
| MIXED SEED CRISPBREAD | PASS | PASS (unchanged) |
| MŁODE PORY DUSZONE W PIWIE | PASS | PASS (unchanged — "Wiosna\n/ Warzywa" has no pipe) |
| OVERNIGHT STRAIGHT PIZZA DOUGH | PASS | PASS (unchanged) |
| Pierogi Ruskie | PASS | PASS (unchanged) |
| SAFFRON WHEAT BUNS... | PASS | PASS (unchanged) |

**Expected accuracy: 100% (all test cases passing)**

---

## Implementation Order

1. **Fix A** — single line addition to `passesHardFilters()`. Run tests.
2. **Fix B** — 4-line guard in bilingual detection block. Run tests.
3. **Fix C** — change `selected` → `rawScored` in one `some()` call. Run tests.

All three changes are in `lib/text-classifier/title-extractor.ts`. No other files need modification.

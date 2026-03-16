# Iteration 23 Improvement Plan

## Failure Summary

1 failure (1 real, 0 generated): "Smażona zielona fasolka" returns empty string.

## Root Cause Analysis

### The failure: complete extraction silence on a trivially-identifiable title

**Input structure:**
```
Line 0: Smażona zielona fasolka        ← Polish title (mixed-case, 3 words)
Line 1: GREEN BEANS BORKEUM            ← English translation (ALL_CAPS)
Line 2: 그린빈 볶음                      ← Korean translation (Hangul)
Line 3-4: OCR-garbled body prose (≥8 words each → filtered)
Line 5: DLA & OSOB                     ← metadata (filtered)
Line 6: Przvgetowanie                  ← OCR-garbled "Przygotowanie" (not in section labels due to corruption)
Line 7+: times, ingredients, instructions
```

**What goes right:**
1. `buildCandidates` correctly generates "Smażona zielona fasolka" as a candidate at position 0 (passes all hard filters).
2. Bilingual detection correctly identifies "GREEN BEANS BORKEUM" as a translation of the position-0 title and suppresses it from `scoredForThreshold`.
3. Korean line "그린빈 볶음" is correctly filtered as garbled (0 ASCII letters).

**What goes wrong — the embedding scoring cliff:**

The embedding model (MiniLM) rates "Smażona zielona fasolka" with nearly identical similarity to both the title reference ("recipe name, dish title, nazwa przepisu, nazwa dania") and the header reference ("ingredients list, cooking directions, składniki, przygotowanie"). The rawScore = titleSim - max(headerSim, noiseSim) ≈ 0.0002 — essentially zero differential signal.

This is a fundamental limitation: Polish food names occupy the same embedding neighborhood as Polish cooking vocabulary in the small model's vector space.

**The kill chain (three consecutive guards reject the candidate):**

1. **Threshold floor kills it**: After bilingual suppression, `scoredForThreshold` contains "Smażona zielona fasolka" (thresholdScore ≈ 0.0002) and "Przvgetowanie" (thresholdScore ≈ 0.07). The threshold = `max(0.08, 0.07 * 0.7)` = **0.08**. Neither candidate reaches 0.08. `selected` is empty.

2. **Fallback rawScore guard kills it**: The empty-pool fallback at line ~915 checks `fallback[0].rawScore > 0.02`. "Smażona zielona fasolka" at position 0 has rawScore ≈ 0.0002, which fails the 0.02 guard. The fallback refuses to return it.

3. **No last-resort exists**: The function returns `undefined`. There is no final safety net that returns the best hard-filter-passing candidate when all embedding-based logic produces nothing.

### Why this matters beyond this one file

The embedding differential (rawScore) being near-zero for legitimate titles is not unique to this file. Any short Polish food name ("Bigos", "Żurek", "Sernik") could theoretically hit the same cliff if the embedding model happens to rate it equidistant from title and header references. The current architecture has no graceful degradation path — when embeddings provide no signal, the system returns nothing rather than falling back to structural/positional heuristics.

## Proposed Changes

### Change 1: Add a last-resort fallback — return first hard-filter-passing line

**Location:** `extractTitleWithEmbeddings()`, after the fallback block (around line 922), before `return undefined`.

**Rationale:** If the entire embedding pipeline (threshold + fallback) produces an empty result, the system should degrade to a pure heuristic: return the first non-blank line from the candidate pool. By definition, this line has already passed all hard filters (no ingredients, no metadata, no garbled text, no section labels, no cooking instructions). The position-0 candidate in a recipe file is overwhelmingly likely to be the title.

**Before:**
```typescript
if (selected.length === 0) {
    return undefined;
}
```

**After:**
```typescript
if (selected.length === 0) {
    // Last resort: embedding scoring provided no usable signal.
    // Return the earliest candidate that passed hard filters — it already survived
    // ingredient, metadata, garbled, section-label, and cooking-instruction checks.
    // Position 0 in a recipe file is overwhelmingly the title.
    const lastResort = scored
      .slice()
      .sort((a, b) => a.position - b.position);
    if (lastResort.length > 0) {
      return normalizeOcrTitle(lastResort[0].text.normalize("NFC").trim());
    }
    return undefined;
}
```

**Why this is safe:**
- The candidate already passed `passesHardFilters`, which rejects ingredients, metadata, garbled text, section labels, cooking instructions, page references, and body text (≥8 words).
- The candidate pool is capped at 25 and prioritizes ALL_CAPS and short candidates.
- The fallback only fires when the embedding pipeline produces **zero** results — meaning even the existing relaxed fallback (rawScore > 0.02) couldn't find anything. This is an extremely rare edge case.
- The earliest-position tiebreak aligns with the strong prior that recipe titles appear at the top of the document.

**Risk assessment:** Very low. This path only activates when embeddings are completely uninformative. The hard filters provide sufficient quality gating. In 22 prior iterations, the failure modes have been wrong-candidate-selected, never "hard filters let through garbage" — the filter layer is well-tested.

### Change 2 (alternative/complementary): Relax the fallback rawScore guard for position-0 candidates

**Location:** The existing fallback block at line ~915.

**Before:**
```typescript
if (fallback[0].rawScore > 0.02) {
    selected = [fallback[0]];
}
```

**After:**
```typescript
// Position-0 candidates that passed hard filters are very likely titles even with
// weak embedding signal. Relax the rawScore guard for early-position candidates.
const rawScoreThreshold = fallback[0].position <= 2 ? -0.05 : 0.02;
if (fallback[0].rawScore > rawScoreThreshold) {
    selected = [fallback[0]];
}
```

**Rationale:** The 0.02 guard was added to prevent ingredient-line leakage. But a candidate at position 0-2 that survived hard filters is almost never an ingredient line — it's a title with weak embedding differentiation. Relaxing the guard specifically for early positions preserves the safety net for deep-in-document candidates while allowing near-zero-signal titles through.

**Risk assessment:** Low. The guard only relaxes for positions 0-2, and hard filters already exclude ingredients. The -0.05 lower bound prevents candidates with actively negative signal (more header-like than title-like) from leaking through.

### Recommendation

**Implement both changes.** Change 2 fixes this specific case (the existing fallback fires and returns the correct title). Change 1 provides a broader safety net for any future case where even the relaxed fallback might not fire (e.g., if the only candidates have rawScores below -0.05 but are still valid titles).

The two changes are complementary, not redundant: Change 2 makes the existing fallback more permissive for early candidates, while Change 1 adds a completely new fallback layer that activates only when the existing one still produces nothing.

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| Real file failures | 1 | 0 |
| Generated file failures | 0 | 0 |
| Total failures | 1 | 0 |

**Regression risk:** Minimal. Change 1 only fires when the entire embedding pipeline returns empty — a path that previously returned `undefined` unconditionally. Change 2 only relaxes a guard for position 0-2 candidates that already passed all hard filters.

**No changes to hard filters, embedding logic, bilingual detection, or scoring are needed.** The existing pipeline correctly identifies the candidate and correctly handles the bilingual layout. The only gap is in the final fallback logic that converts "low confidence" into "no answer" when "best guess" would be correct.

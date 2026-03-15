# Iteration 9 — Improvement Plan

## Summary

One failure remains: `Faszerowana papryka.real.txt`. The algorithm returns `PAPRIKA GYERAN-JJIM` (Korean romanization at position 1) instead of `Faszerowana papryka` (Polish title at position 0). The fix is a targeted relaxation of the bilingual detection guard — no other code paths need to change.

---

## Root Cause Analysis

### The bilingual detection condition is count-based when it should be position-based

The pre-threshold bilingual suppression block (lines 390–395) was designed for exactly this pattern: a mixed-case title at position 0 followed by an ALL_CAPS foreign romanization at position ≤ 2. It correctly identifies `prePos0` (the mixed-case candidate at position 0) but then gates on `preAllCaps.length === 1` — requiring the *entire document* to contain exactly one ALL_CAPS candidate.

This document has **four** ALL_CAPS candidates that pass `passesHardFilters`:

| Candidate | Position | Role |
|---|---|---|
| `PAPRIKA GYERAN-JJIM` | 1 | Korean romanization (should be suppressed) |
| `NA 3 PAPRYKI` | 5 | Serving size |
| `SKŁADNIKI` | 9 | Section header |
| `WARZYWA` | 25 | Section header |

Because `preAllCaps.length === 4`, the suppression does **not** fire. `PAPRIKA GYERAN-JJIM` enters scoring unsuppressed and accumulates +0.18 in bonuses (ALL_CAPS +0.08, structural heading +0.10) that overwhelm `Faszerowana papryka`'s position advantage.

### Why this is a general pattern, not a one-off

Polish recipe books routinely use ALL_CAPS for section headers (SKŁADNIKI, PRZYGOTOWANIE, WARZYWA) and serving info (NA 3 PAPRYKI). Any bilingual recipe page will have these alongside the foreign romanization, making `preAllCaps.length === 1` structurally impossible to satisfy. The count-based guard was written for a minimal case that doesn't occur in real documents.

---

## Proposed Fix

### Replace count-based guard with positional + semantic check

**Current code (lines 390–395):**
```typescript
const prePos0 = scored.find((s) => s.position === 0 && !isAllCaps(s.text));
const preAllCaps = scored.filter((s) => isAllCaps(s.text));
if (prePos0 && preAllCaps.length === 1 && preAllCaps[0].position <= 2) {
  const capsLower = preAllCaps[0].text.toLowerCase();
  scoredForThreshold = scored.filter((s) => !s.text.toLowerCase().startsWith(capsLower));
}
```

**Proposed code:**
```typescript
const prePos0 = scored.find((s) => s.position === 0 && !isAllCaps(s.text));
if (prePos0) {
  // Find ALL_CAPS candidates at position ≤ 2 (immediately after mixed-case title)
  const nearbyAllCaps = scored.filter(
    (s) => isAllCaps(s.text) && s.position >= 1 && s.position <= 2
  );
  // Check if any nearby ALL_CAPS candidate is semantically close to the position-0
  // candidate — indicating it's a translation/romanization of the same dish name.
  // Use the already-computed embeddings from rawScored.
  const pos0Embedding = rawScored.find((r) => r.text === prePos0.text)?.embedding;
  if (pos0Embedding) {
    const translationCandidates = nearbyAllCaps.filter((cap) => {
      const capEmbedding = rawScored.find((r) => r.text === cap.text)?.embedding;
      if (!capEmbedding) return false;
      const sim = cosineSimilarity(pos0Embedding, capEmbedding);
      return sim > 0.4;
    });
    if (translationCandidates.length > 0) {
      const suppressTexts = new Set(translationCandidates.map((t) => t.text.toLowerCase()));
      scoredForThreshold = scored.filter((s) => !suppressTexts.has(s.text.toLowerCase()));
    }
  }
}
```

### Why this works

1. **Positional check** (`position >= 1 && position <= 2`): Only considers ALL_CAPS candidates immediately after the mixed-case title. Section headers at position 9, 25 are irrelevant — they can't be bilingual translations of the title.

2. **Semantic similarity check** (`cosineSimilarity > 0.4`): Both `Faszerowana papryka` and `PAPRIKA GYERAN-JJIM` are dish names. Their embeddings will be close because they refer to the same concept (a paprika dish). This distinguishes a translation from an unrelated ALL_CAPS line that happens to appear at position 1–2 (unlikely but possible).

3. **No new embedding calls**: Both candidates already have embeddings computed in the rawScored pass. We reuse them, adding zero latency.

4. **Suppression scope**: Only the translation candidate is removed from `scoredForThreshold` — all other candidates (including other ALL_CAPS section headers) remain in the pool. This is narrower and safer than the current approach which removes anything starting with the caps candidate's text.

### What changes

| Aspect | Before | After |
|---|---|---|
| Guard condition | `preAllCaps.length === 1` (global count) | `nearbyAllCaps` at position ≤ 2 (local) |
| Validation | None (position ≤ 2 only) | Position ≤ 2 AND embedding similarity > 0.4 |
| Suppression target | Anything starting with the single ALL_CAPS text | Exact match on confirmed translation candidates |
| Handles multiple section headers | No (breaks when count > 1) | Yes (ignores distant ALL_CAPS entirely) |

### What does NOT change

- Hard filters, candidate generation, merge logic — all untouched
- Scoring bonuses (ALL_CAPS +0.08, structural heading +0.10) — unchanged
- Dedup logic, multi-title guard, continuation join protection — unchanged
- Threshold computation formula — unchanged
- Empty-pool fallback — unchanged

---

## Edge Cases and Regression Safety

### Case: Bilingual page with no section headers (original minimal case)
Before: `preAllCaps.length === 1` fires. After: `nearbyAllCaps` finds the same single candidate, similarity > 0.4 (both are dish names), suppression fires. **Same result.**

### Case: ALL_CAPS title at position 0, mixed-case subtitle at position 1
`prePos0` requires `!isAllCaps(s.text)`, so if position 0 is ALL_CAPS, the block doesn't activate. **No change.**

### Case: Mixed-case at position 0, unrelated ALL_CAPS at position 1
If the ALL_CAPS candidate at position 1 is semantically unrelated (e.g., "SERVES 4" that somehow passed filters), its embedding similarity to the position-0 candidate will be low (< 0.4). The block won't suppress it. **Safe.**

### Case: No mixed-case at position 0
`prePos0` is undefined, entire block is skipped. **No change.**

---

## Similarity Threshold Justification (0.4)

The threshold of 0.4 is deliberately low because:
- Two dish names referring to the same recipe (even in different languages) typically have cosine similarity 0.5–0.8 with MiniLM, because the food concept (paprika, eggs, etc.) overlaps strongly.
- A dish name vs. a section header ("SKŁADNIKI", "PRZYGOTOWANIE") typically has similarity 0.15–0.35, because they share no food-concept overlap.
- 0.4 sits cleanly in the gap between these distributions.

If the gap turns out to be narrower for some language pairs, the threshold can be raised to 0.5 without losing this case (PAPRIKA/papryka share a cognate root, so similarity will be well above 0.5).

---

## Implementation Checklist

1. Replace the bilingual detection block at lines 389–395 in `title-extractor.ts`
2. No new imports needed (`cosineSimilarity` already imported, `rawScored` embeddings already available)
3. No new embedding calls (zero performance impact)
4. Run existing test suite to confirm no regressions
5. Run title-loop evaluation to confirm `Faszerowana papryka` now returns correctly

---

## Expected Impact

| Metric | Before | After |
|---|---|---|
| Passing cases | 7/8 (87.5%) | 8/8 (100%) |
| New embedding calls | 0 | 0 |
| Lines changed | ~6 lines replaced | ~15 lines replacement |
| Risk of regression | — | Low (strictly narrower suppression scope, with semantic validation gate) |

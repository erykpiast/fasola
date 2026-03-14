# Improvement Plan — Iteration 6

## Why Iteration 5 Failed

The iteration 4 plan correctly diagnosed all three failures and proposed five changes, but the critical ones (origin tracking, continuation join protection, embedding-based baseHeading, distributed structural bonus) were not implemented. The code still has:
- No `origin` field on candidates — continuation join protection can't distinguish joins from singles
- `baseHeading = candidates.find(isStructuralHeading)` — still purely positional
- `structuralBonus` still exclusive to `firstStructuralHeading` (+0.10, one candidate only)

This iteration re-proposes the essential changes with tighter implementation specifications.

---

## Root Cause Analysis

### Failure 1: `Baked Eggs with Feta, Harissa Tomato Sauce & Coriander` → `''`

The title is split across two OCR lines. The 2-line join passes hard filters but dedup removes it: the single-line fragment `Baked Eggs with Feta, Harissa Tomato Sauce` is a substring and shorter, so the join is discarded. The surviving partial likely falls below threshold (no ALL_CAPS bonus, no structural bonus).

**Root cause:** Dedup's "shorter wins" rule cannot distinguish "title + ingredient run-on" (where shorter is correct) from "first half of split title + complete title join" (where longer is correct). The `& Coriander` continuation is the discriminating signal.

### Failure 2: `FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS` → `FINNISH MILK FLATBREADS`

Both titles pass `isStructuralHeading`. But only the first gets `structuralBonus` (+0.10). This inflates `bestBaseScore`, which raises `threshold = bestBaseScore × 0.7`. The second title has only `allCapsBonus` (+0.08) and no position boost (at ~65% depth), so it falls below the inflated threshold. The multi-title guard never fires because the second title is already filtered out.

**Root cause:** `structuralBonus` leaks into `bestBaseScore`, raising the bar so high that equally-valid structural headings without the bonus can't pass. The iteration 3 fix for position-boost leakage was not extended to bonus leakage.

### Failure 3: `SAFFRON WHEAT BUNS WITH QUARK : COTTAGE CHEESE (VARIATION D)` → `FRON WHEAT BUNS (VARIATION 1)`

The garbled OCR fragment `FRON WHEAT BUNS (VARIATION 1)` appears earlier in the document and passes `isStructuralHeading` (all sig words ≥ 4 uppercase letters). Being the first positional match, it becomes `baseHeading`, gets `structuralBonus` (+0.10), and hijacks the continuation extension logic. The correct title's 2-line join is also killed by dedup (same mechanism as Failure 1).

**Root cause:** `baseHeading` selection is purely positional with no quality signal. A garbled OCR fragment that happens to satisfy `isStructuralHeading` can claim the structural heading slot over the real title.

---

## Proposed Changes

### Change 1: Track candidate origin in `buildCandidates`

**What:** Add an `origin` field (`"single" | "2-line" | "3-line"`) to candidate objects. This is pure metadata — no behavioral change — but is required by Change 2.

**Where:** `title-extractor.ts`, `buildCandidates` function (lines 163–231).

**Before:**
```ts
function buildCandidates(
  lines: Array<string>
): Array<{ text: string; position: number }> {
```

**After:**
```ts
export type CandidateOrigin = "single" | "2-line" | "3-line";

function buildCandidates(
  lines: Array<string>
): Array<{ text: string; position: number; origin: CandidateOrigin }> {
```

Tag each `candidates.push(...)` call:
- Line 187: `candidates.push({ text: line.text, position: line.index, origin: "single" });`
- Line 198: `candidates.push({ text: joined2, position: line.index, origin: "2-line" });`
- Line 210: `candidates.push({ text: joined3, position: line.index, origin: "3-line" });`

Propagate the `origin` field through `scored` and `selected` arrays (add to their type signatures).

**Impact:** None by itself. Enables Change 2.

---

### Change 2: Protect continuation joins from dedup (fixes Failures 1 and 3-secondary)

**What:** Before the dedup filter, remove single-line candidates that are a prefix of a surviving multi-line join whose continuation part begins with a continuation character (`/`, `&`, `+`, `:`, `(`). This prevents the "shorter wins" rule from destroying valid title joins.

**Where:** New block inserted between the structural-heading prefix removal (line 352) and the dedup filter (line 359). The dedup block itself is NOT modified (respecting the guard comment).

**Logic:**
```ts
// Protect continuation joins: when a multi-line join survived the threshold and
// its second part starts with a continuation character, remove the single-line
// prefix so dedup can't destroy the complete join.
const survivingJoins = selected.filter(
  (s) => s.origin === "2-line" || s.origin === "3-line"
);
if (survivingJoins.length > 0) {
  selected = selected.filter((s) => {
    if (s.origin !== "single") return true;
    const sLower = s.text.toLowerCase();
    return !survivingJoins.some((j) => {
      const jLower = j.text.toLowerCase();
      if (!jLower.startsWith(sLower + " ")) return false;
      const remainder = jLower.slice(sLower.length + 1);
      return /^[/&+:(]/.test(remainder);
    });
  });
}
```

**Why safe for Pierogi Ruskie:** The join `"Pierogi Ruskie 200g mąki 3 ziemniaki"` has a continuation starting with `"200g"` — a digit, not a continuation character. The prefix `"Pierogi Ruskie"` is preserved, dedup correctly picks it. No behavioral change for non-continuation joins.

**Expected impact:** Fixes Failure 1 — the join `"Baked Eggs with Feta, Harissa Tomato Sauce & Coriander"` is protected (continuation starts with `&`). Also fixes the secondary issue in Failure 3 — the join `"SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)"` is protected (continuation starts with `/`).

---

### Change 3: Exclude `structuralBonus` from threshold computation (fixes Failure 2)

**What:** Compute `bestBaseScore` using `rawScore + allCapsBonus` only, excluding `structuralBonus` (and `firstHeadingBonus` if Change 4 adds one). The structural bonus still helps the heading win the ranking, but does not inflate the threshold that other candidates must pass.

**Where:** Scoring loop and threshold computation (lines 320–332).

**Before:**
```ts
const baseScore = rawScore + allCapsBonus + structuralBonus;
// ...
const bestBaseScore = Math.max(...scored.map((s) => s.baseScore));
const threshold = Math.max(0.08, bestBaseScore * 0.7);
```

**After:** Add a new field `thresholdScore` that excludes structural bonus:
```ts
const baseScore = rawScore + allCapsBonus + structuralBonus;
const thresholdScore = rawScore + allCapsBonus; // no structural bonus
// ...
const bestThresholdScore = Math.max(...scored.map((s) => s.thresholdScore));
const threshold = Math.max(0.08, bestThresholdScore * 0.7);
```

**Why this works:** On the Finnish Flatbreads page, `FINNISH MILK FLATBREADS` has `rawScore ≈ X`, `allCapsBonus = 0.08`, `structuralBonus = 0.10`. Previously `bestBaseScore = X + 0.18` and `threshold = (X + 0.18) × 0.7`. Now `bestThresholdScore = X + 0.08` and `threshold = (X + 0.08) × 0.7`. The second title with `score = X' + 0.08` (similar rawScore, same allCapsBonus) easily clears this lower bar.

**Why safe:** The structural bonus still contributes to `score` and `baseScore` for ranking purposes — it just doesn't inflate the threshold. Single-recipe pages are unaffected because there's only one candidate to rank.

**Expected impact:** Fixes Failure 2. Both Finnish titles pass the threshold; the multi-title guard (`allCapsSelected.length >= 2`) fires and returns both.

---

### Change 4: Select `baseHeading` by embedding quality, not position (fixes Failure 3-primary)

**What:** Defer `baseHeading` selection until after embeddings are computed. Instead of `candidates.find(isStructuralHeading)` (first positional match), pick the structural heading candidate with the highest `rawScore`.

**Where:** Move structural heading selection from lines 278–292 to after the scoring loop (after line 323).

**Before (line 278):**
```ts
const baseHeading = candidates.find(isStructuralHeading);
```

**After (after scoring loop, before threshold computation):**
```ts
// Select baseHeading by embedding quality (rawScore), not position.
// This prevents OCR-garbled fragments from claiming the structural heading slot.
const structuralCandidateScores = scored.filter((s) => {
  const orig = candidates.find((c) => c.text === s.text);
  return orig && isStructuralHeading(orig);
});
const bestStructural = structuralCandidateScores.length > 0
  ? structuralCandidateScores.reduce((a, b) => a.rawScore > b.rawScore ? a : b)
  : null;
const baseHeading = bestStructural
  ? candidates.find((c) => c.text === bestStructural.text)
  : undefined;
```

This requires restructuring the scoring loop slightly: compute `rawScore` first (without bonuses), then select `baseHeading`, then assign bonuses in a second pass. The restructuring adds no new embedding calls.

**Restructured scoring flow:**
```ts
// Pass 1: compute rawScore for all candidates
const rawScored = [];
for (const candidate of candidates) {
  const embedding = await embed(candidate.text);
  const titleSim = cosineSimilarity(embedding, cachedTitleRefEmbedding);
  const headerSim = cosineSimilarity(embedding, cachedHeaderRefEmbedding);
  const noiseSim = cosineSimilarity(embedding, cachedNoiseRefEmbedding);
  const rawScore = titleSim - Math.max(headerSim, noiseSim);
  rawScored.push({ ...candidate, rawScore, embedding });
}

// Select baseHeading by rawScore quality
const structuralCandidates = rawScored.filter((s) => isStructuralHeading(s));
const bestStructural = structuralCandidates.length > 0
  ? structuralCandidates.reduce((a, b) => a.rawScore > b.rawScore ? a : b)
  : null;
const baseHeading = bestStructural ?? undefined;

// Derive firstStructuralHeading (continuation extension) — same logic as before
const firstStructuralHeading = baseHeading && (
  rawScored.find((c) => {
    if (!isStructuralHeading(c)) return false;
    const hLower = baseHeading.text.toLowerCase();
    const cLower = c.text.toLowerCase();
    return cLower.startsWith(hLower + " ") && /^[/&+:(]/.test(cLower.slice(hLower.length + 1));
  }) ?? baseHeading
);

// Pass 2: apply bonuses
const scored = rawScored.map((rs) => {
  const relativePosition = rs.position / lines.length;
  const positionFactor = relativePosition < 0.5 ? 1.0 + 0.12 * (1 - relativePosition * 2) : 1.0;
  const allCapsBonus = isAllCaps(rs.text) && rs.text.replace(/[^a-zA-Z]/g, "").length >= 4 ? 0.08 : 0;
  const structuralBonus = firstStructuralHeading && rs.text === firstStructuralHeading.text ? 0.10 : 0;
  const thresholdScore = rs.rawScore + allCapsBonus;
  const baseScore = rs.rawScore + allCapsBonus + structuralBonus;
  const score = rs.rawScore * positionFactor + allCapsBonus + structuralBonus;
  return { ...rs, score, rawScore: rs.rawScore, baseScore, thresholdScore };
});
```

**Why this works:** `FRON WHEAT BUNS (VARIATION 1)` is garbled — its MiniLM embedding will have low similarity to the title reference ("recipe name, dish title") compared to `SAFFRON WHEAT BUNS WITH QUARK`, a plausible recipe title. The correct heading wins `baseHeading`, continuation extension fires for the `/` join, and the structural bonus goes to the right candidate.

**Performance:** Zero additional embedding calls. Same candidates, same embeddings, just reordered logic.

**Expected impact:** Fixes the primary bug in Failure 3.

---

### Change 5: OCR truncation cross-validation (defense-in-depth for Failure 3)

**What:** After selecting `bestStructural` in Change 4, add a lightweight cross-validation: if a significant word in one structural heading is a strict suffix of a significant word in another structural heading, penalize the shorter-word candidate's rawScore by -0.15. This catches `FRON` being a suffix of `SAFFRON`.

**Where:** Between structural candidate filtering and `bestStructural` selection in Change 4.

**Logic:**
```ts
// Penalize structural headings with truncated OCR words:
// if "FRON" appears and another heading has "SAFFRON", "FRON" is likely garbled
for (const sc of structuralCandidates) {
  const sigWords = sc.text.split(/\s+/).filter((w) => w.replace(/[^A-Z]/g, "").length >= 4);
  for (const other of structuralCandidates) {
    if (other === sc) continue;
    const otherSigWords = other.text.split(/\s+/).filter((w) => w.replace(/[^A-Z]/g, "").length >= 4);
    const hasTruncation = sigWords.some((w) =>
      otherSigWords.some((ow) => ow !== w && ow.length > w.length && ow.endsWith(w))
    );
    if (hasTruncation) {
      sc.rawScore -= 0.15;
      break;
    }
  }
}
```

**Why safe:** Only fires when two structural headings share a suffix relationship — extremely unlikely to produce false positives. On the Finnish page, `FLATBREADS` appears in both titles but `ow !== w` prevents self-matching and neither is a suffix of the other.

**Expected impact:** Additional safety for Failure 3. Even if embeddings alone don't sufficiently separate the garbled candidate, the -0.15 penalty ensures it loses.

---

## Summary

| Change | Fixes | Risk | Scope |
|---|---|---|---|
| 1. Track `origin` field | Enables #2 | None (metadata only) | `buildCandidates` return type |
| 2. Protect continuation joins | F1, F3 secondary | Low — continuation char guard | New block before dedup |
| 3. Exclude structural bonus from threshold | F2 | Low — bonus still helps ranking | Threshold computation (2 lines) |
| 4. Embedding-quality baseHeading | F3 primary | Low — better signal, same data | Restructure scoring into 2 passes |
| 5. OCR truncation penalty | F3 defense | Very low — strict cross-match only | New block in structural selection |

### Performance

- **Zero additional embedding calls.** All changes reorder existing logic or add O(25²) string comparisons.
- **No new dependencies.** All changes within `title-extractor.ts`.
- **Mobile-safe.** Well under the 10-second budget.

### Expected Accuracy

- **F1 (Baked Eggs):** Fixed by Changes 1+2. Join is protected from dedup → `"Baked Eggs with Feta, Harissa Tomato Sauce & Coriander"` survives.
- **F2 (Finnish Flatbreads):** Fixed by Change 3. Threshold no longer inflated by structural bonus → both titles pass → multi-title guard joins them with `+`.
- **F3 (Saffron Wheat Buns):** Fixed by Changes 4+5 (correct baseHeading) + Changes 1+2 (correct join protected) → `"SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)"` is returned.

### Regression Risks

- **Pierogi Ruskie:** Change 2 does NOT protect this join (continuation starts with `"200g"`, a digit). Dedup correctly keeps the shorter form.
- **ARAYES SHRAK:** Existing structural heading prefix removal (lines 337–352) still fires. Change 2 adds a parallel protection path but doesn't conflict.
- **MIXED SEED CRISPBREAD / OVERNIGHT PIZZA DOUGH:** Single structural headings. Change 3 doesn't affect threshold when there's only one strong candidate. Change 4 picks the same heading (only one structural candidate).

### Key Difference from Iteration 4 Plan

The iteration 4 plan proposed essentially the same changes but they weren't implemented. This plan:
1. **Makes the restructuring explicit** — Change 4 spells out the 2-pass scoring flow so it's clear how to restructure without breaking the existing logic.
2. **Separates threshold from ranking** — Change 3 uses a dedicated `thresholdScore` field rather than trying to redistribute bonuses, which is simpler to implement correctly.
3. **Emphasizes the dependency chain** — Changes must be implemented in order: 1 → 2, and 4 → 5. Change 3 is independent. The scoring restructure in Change 4 is the most invasive and should be implemented carefully.

# Improvement Plan — Iteration 5

## Root Cause Analysis

### Failure 1: Baked Eggs (dedup kills continuation join)

The 2-line join `"Baked Eggs with Feta, Harissa Tomato Sauce & Coriander"` is the correct title. The dedup "shorter wins" filter removes it because the single-line candidate `"Baked Eggs with Feta, Harissa Tomato Sauce"` is a substring and shorter. The pre-filter at lines 344–352 only protects joins that match `firstStructuralHeading` — this mixed-case join gets no protection.

**Core problem:** The pipeline has no concept of "this candidate was built by joining lines whose second part starts with a continuation character" — so it can't distinguish a legitimate continuation join from title+noise.

### Failure 2: Finnish Flatbreads (second structural heading suppressed)

Both `FINNISH MILK FLATBREADS` and `FINNISH POTATO FLATBREADS` pass `isStructuralHeading`, but only the first receives `structuralBonus` (+0.10). The second title's `baseScore` falls below the threshold (`bestBaseScore * 0.7`) inflated by the first title's bonus.

**Core problem:** `structuralBonus` is exclusive to `firstStructuralHeading`. On multi-recipe pages, subsequent structural headings are penalised by the very threshold their sibling inflated.

### Failure 3: Saffron Wheat Buns (OCR garbage + dedup compound)

Two compounding bugs:
1. `candidates.find(isStructuralHeading)` picks the first match — `"FRON WHEAT BUNS (VARIATION 1)"`, an OCR-corrupted fragment from the previous recipe. It gets `structuralBonus` +0.10.
2. The correct 2-line join `"SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)"` is deduped away by its own first-line fragment (same mechanism as Failure 1).

**Core problem:** `baseHeading` selection is purely positional (first match wins) with no quality signal. The OCR fragment looks structurally valid to `isStructuralHeading`.

---

## Proposed Changes

### Change 1: Track join origin in `buildCandidates`

**What:** Add a `joinType` field to candidate objects: `"single"`, `"2-line"`, or `"3-line"`. This metadata enables downstream logic to distinguish joins from single-line candidates.

**Where:** `buildCandidates` function, lines 163–231.

**Before:**
```ts
function buildCandidates(
  lines: Array<string>
): Array<{ text: string; position: number }> {
```

**After:**
```ts
type CandidateOrigin = "single" | "2-line" | "3-line";

function buildCandidates(
  lines: Array<string>
): Array<{ text: string; position: number; origin: CandidateOrigin }> {
```

Each `candidates.push(...)` call tags the origin accordingly. Single-line pushes get `origin: "single"`, 2-line joins get `origin: "2-line"`, 3-line joins get `origin: "3-line"`.

**Impact:** No behavioral change by itself. Enables Changes 2 and 4.

---

### Change 2: Protect continuation joins from dedup (fixes Failures 1 and 3)

**What:** Before the dedup filter, remove single-line candidates that are prefixes of a multi-line join whose continuation part starts with a known continuation character (`/`, `&`, `+`, `:`, `(`). This generalizes the existing structural-heading pre-filter (lines 344–352) to ALL continuation joins, not just structural headings.

**Where:** New block inserted between the structural-heading pre-filter (line 352) and the dedup filter (line 359).

**Logic:**
```ts
// Protect continuation joins: when a multi-line join exists and its second part
// begins with a continuation character, remove the single-line prefix candidate
// so dedup doesn't kill the complete join.
const continuationJoins = selected.filter((s) => {
  const c = candidates.find((orig) => orig.text === s.text);
  return c && (c.origin === "2-line" || c.origin === "3-line");
});
if (continuationJoins.length > 0) {
  selected = selected.filter((s) => {
    // Keep if it's not a single-line candidate
    const c = candidates.find((orig) => orig.text === s.text);
    if (!c || c.origin !== "single") return true;
    // Remove if a continuation join starts with this text + continuation char
    const sLower = s.text.toLowerCase();
    return !continuationJoins.some((j) => {
      const jLower = j.text.toLowerCase();
      if (!jLower.startsWith(sLower + " ")) return false;
      const remainder = jLower.slice(sLower.length + 1);
      return /^[/&+:(]/.test(remainder);
    });
  });
}
```

**Why this is safe:** The Pierogi Ruskie case is unaffected — `"Pierogi Ruskie 200g mąki 3 ziemniaki"` is a join whose continuation does NOT start with a continuation character (it starts with `"200g"`), so the prefix `"Pierogi Ruskie"` is preserved and dedup still picks the shorter form. The dedup block itself remains completely untouched (respecting the guard comment).

**Expected impact:** Fixes Failure 1 (Baked Eggs) and the secondary bug in Failure 3 (Saffron dedup).

---

### Change 3: Give `structuralBonus` to ALL structural headings (fixes Failure 2)

**What:** Replace the exclusive first-heading bonus with a bonus for every candidate that passes `isStructuralHeading`. Reduce the bonus from +0.10 to +0.06 to compensate for broader application, and keep a smaller +0.04 "first heading" bonus.

**Where:** Scoring loop, line 315–316.

**Before:**
```ts
const structuralBonus =
  firstStructuralHeading && candidate === firstStructuralHeading ? 0.10 : 0;
```

**After:**
```ts
// Give a base structural bonus to ALL structural headings, with a smaller
// first-heading tiebreaker so the earliest heading wins among equals.
const isStructural = isStructuralHeading(candidate);
const structuralBonus = isStructural ? 0.06 : 0;
const firstHeadingBonus =
  firstStructuralHeading && candidate === firstStructuralHeading ? 0.04 : 0;
```

Update `baseScore` and `score` to include `firstHeadingBonus`:
```ts
const baseScore = rawScore + allCapsBonus + structuralBonus + firstHeadingBonus;
const score = rawScore * positionFactor + allCapsBonus + structuralBonus + firstHeadingBonus;
```

**Why this works:** On the Finnish Flatbreads page, both titles now get +0.06 structural bonus. The first title still gets a +0.04 edge, but the second title's baseScore is only 0.04 below (instead of 0.10), which keeps it above the `bestBaseScore * 0.7` threshold. The first-heading tiebreaker preserves existing behavior for single-recipe pages.

**Expected impact:** Fixes Failure 2 (Finnish Flatbreads). Also reduces the damage from a garbage fragment claiming `firstStructuralHeading` (Failure 3) since the bonus gap shrinks from 0.10 to 0.04.

---

### Change 4: Select `baseHeading` by embedding quality, not position (fixes Failure 3)

**What:** Instead of `candidates.find(isStructuralHeading)` (first positional match), defer `baseHeading` selection until after embeddings are computed. Pick the structural heading with the highest `rawScore` (embedding-only, no bonuses).

**Where:** Move structural heading selection from lines 278–292 to after the embedding scoring loop (after line 323).

**Before (line 278):**
```ts
const baseHeading = candidates.find(isStructuralHeading);
```

**After (after scoring loop):**
```ts
// Select baseHeading from structural headings using embedding quality,
// not just position. This prevents OCR garbage from claiming the slot.
const structuralCandidates = scored.filter((s) =>
  isStructuralHeading(candidates.find((c) => c.text === s.text)!)
);
const baseHeadingScored = structuralCandidates.length > 0
  ? structuralCandidates.reduce((a, b) => a.rawScore > b.rawScore ? a : b)
  : null;
const baseHeading = baseHeadingScored
  ? candidates.find((c) => c.text === baseHeadingScored.text)!
  : undefined;
```

The continuation logic (lines 285–292) and `firstStructuralHeading` derivation remain the same but now operate on the embedding-validated base heading.

**Why this works:** `"FRON WHEAT BUNS (VARIATION 1)"` is OCR garbage — its embedding similarity to the title reference is low. `"SAFFRON WHEAT BUNS WITH QUARK"` is a real recipe title and scores higher with MiniLM. The correct heading wins the `baseHeading` slot, continuation logic fires correctly to produce the full join, and the pre-filter protects it from dedup.

**Performance note:** No additional embedding calls — we simply reorder when the selection happens within the existing loop.

**Expected impact:** Fixes the primary bug in Failure 3 (wrong baseHeading).

---

### Change 5: Add OCR-fragment heuristic to `isStructuralHeading`

**What:** Add a lightweight heuristic: if the first significant word of an ALL_CAPS candidate does not appear in a dictionary of common English food/cooking words AND has fewer than 4 characters, demote it. More practically: check if any significant word looks like a truncated fragment by testing whether it starts mid-word (no English word starts with consonant clusters like "FR" + vowel pattern that doesn't form a word).

Actually, a simpler and more robust approach: check if any significant word in the candidate is a substring of a significant word in another structural heading candidate. If `"FRON"` is a suffix-truncation of `"SAFFRON"` (from another candidate), penalize it.

**Where:** After building `structuralCandidates` (from Change 4), add a cross-candidate validation step.

**Logic:**
```ts
// Penalize structural headings where a significant word looks like a truncation
// of a word in another structural heading (OCR corruption detection).
for (const sc of structuralCandidates) {
  const sigWords = sc.text.split(/\s+/).filter((w) => w.replace(/[^A-Z]/g, "").length >= 4);
  for (const other of structuralCandidates) {
    if (other === sc) continue;
    const otherSigWords = other.text.split(/\s+/).filter((w) => w.replace(/[^A-Z]/g, "").length >= 4);
    for (const word of sigWords) {
      if (otherSigWords.some((ow) => ow !== word && ow.endsWith(word))) {
        // word looks like a truncated version of a word in another heading
        sc.rawScore -= 0.15;
        break;
      }
    }
  }
}
```

This catches `FRON` being a suffix of `SAFFRON` — the candidate `"FRON WHEAT BUNS (VARIATION 1)"` gets a -0.15 penalty, ensuring it loses to `"SAFFRON WHEAT BUNS WITH QUARK"` in `baseHeading` selection.

**Expected impact:** Additional safety net for Failure 3 pattern. Won't fire on false positives because it requires another structural heading to contain the full word.

---

## Summary of Changes and Expected Impact

| Change | Fixes | Risk | Lines touched |
|---|---|---|---|
| 1. Track join origin | Enables 2 & 4 | None (metadata only) | `buildCandidates` |
| 2. Protect continuation joins | Failures 1, 3 (secondary) | Low — continuation char guard prevents false matches | New block before dedup |
| 3. Distribute structuralBonus | Failure 2 | Low — smaller per-candidate bonus, first-heading tiebreaker preserved | Scoring loop (2 lines) |
| 4. Embedding-based baseHeading | Failure 3 (primary) | Low — better signal, same candidates | Move selection after embedding loop |
| 5. OCR truncation penalty | Failure 3 (defense in depth) | Very low — only fires when cross-candidate word match exists | New post-scoring block |

### Performance

- **No additional embedding calls.** Changes 1–5 add only lightweight string operations and reorder existing logic.
- **No new dependencies.** All changes are within `title-extractor.ts`.
- **Mobile-safe.** The added loops iterate over at most 25 candidates (existing cap) with simple string comparisons.

### Expected Accuracy Impact

- **Failure 1 (Baked Eggs):** Fixed by Change 2. The continuation join is protected; dedup no longer kills it.
- **Failure 2 (Finnish Flatbreads):** Fixed by Change 3. Both structural headings get bonus; second title passes threshold.
- **Failure 3 (Saffron Wheat Buns):** Fixed by Changes 4+5 (correct baseHeading selection) and Change 2 (correct join preserved through dedup).

### Regression Risks

- **Pierogi Ruskie dedup:** Unaffected. The join `"Pierogi Ruskie 200g mąki..."` does not start with a continuation character after the prefix, so Change 2 doesn't protect it. Dedup correctly picks the shorter form.
- **ARAYES SHRAK structural prefix removal:** Unaffected. The existing pre-filter at lines 344–352 still fires for structural heading prefixes. Change 2 adds a parallel path for non-structural continuation joins.
- **Single-recipe pages:** Change 3 gives +0.06 structural bonus to the sole structural heading (vs +0.10 before) plus +0.04 first-heading bonus = +0.10 total. Net effect is identical.

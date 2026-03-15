# Iteration 8 Failure Analysis

## Failures

### 1. `Baked Eggs with Feta, Harissa Tomato Sauce & Coriander` → `''`

**Input structure:**
```
Line 1: "Baked Eggs with Feta, Harissa Tomato Sauce"
Line 2: "& Coriander"
Line 3: (long body text paragraph)
...
Lines 4+: ingredients starting with numbers, long body text
```

**What the algorithm does:**
The pre-merge step in `buildCandidates` correctly identifies "& Coriander" as a continuation line (starts with `&`) and merges it with the preceding line, producing the single candidate "Baked Eggs with Feta, Harissa Tomato Sauce & Coriander". This candidate passes all hard filters: 54 chars (under 80), no measurement patterns, no metadata pattern, not garbled.

**Why it fails — embedding scoring:**
The merged title contains ingredient-like terms ("Harissa Tomato Sauce", "Feta") that increase cosine similarity to `HEADER_REFERENCE` ("ingredients list, cooking directions, section heading"). If `headerSim >= titleSim`, then `rawScore = titleSim - max(headerSim, noiseSim) <= 0`. With no `allCapsBonus` (mixed-case) and no `structuralBonus` (not structural heading), the final score `rawScore * 1.12` can fall below the 0.08 minimum threshold. The candidate is filtered out, and `selected` becomes empty, returning `undefined`/`''`.

The code even comments on line 413: "the pre-merge step above already handles the common Baked Eggs case" — yet the candidate is silently discarded in scoring. The hard filters pass but the threshold gate fails.

**Root cause:** Descriptive recipe titles containing ingredient names (sauces, cheeses, spices) are penalised by the HEADER_REFERENCE because ingredient words pull the embedding toward the ingredient-list reference rather than the title reference. There is no floor or fallback for a candidate that passes all hard filters and is the only candidate in the pool.

---

### 2. `Faszerowana papryka` → `'PAPRIKA GYERAN-JJIM'`

**Input structure:**
```
Line 1: "Faszerowana papryka"   (Polish title)
Line 2: "PAPRIKA GYERAN-JJIM"  (ALL_CAPS Korean-romanised subtitle)
Line 3: "파프리카 계란찜"           (Korean script — filtered by isLikelyGarbled: letters.length < 2)
Line 4: (Polish body text, starts lowercase → filtered)
```

**What the algorithm does:**
Both "Faszerowana papryka" and "PAPRIKA GYERAN-JJIM" pass hard filters:
- "Faszerowana papryka": 19 chars, starts uppercase, Polish vowel ratio ~0.44, no measurements. Passes.
- "PAPRIKA GYERAN-JJIM": ALL_CAPS, `isStructuralHeading` qualifies it (≥2 sig words, each ≥4 alpha chars).

In scoring, "PAPRIKA GYERAN-JJIM" receives `+0.08` allCapsBonus + `+0.10` structuralBonus = `+0.18` on top of its rawScore. "Faszerowana papryka" receives neither bonus.

**Why the first-line protection fails:**
The algorithm has an explicit guard (lines 468–479) for exactly this pattern: "mixed-case title at position 0 followed by a single ALL_CAPS subtitle". The guard correctly identifies `pos0 = selected.find(s => s.position === 0 && !isAllCaps(s.text))` and `allCapsCandidates.length === 1` at position 1.

But the guard has a precondition: both candidates must already be in `selected` (i.e., both must have passed the threshold filter). The protection fires *after* the threshold filter, not before it.

If "Faszerowana papryka" scores below threshold — which is plausible because:
- TITLE_REFERENCE is English; a short Polish phrase has lower cosine similarity to it
- The threshold is inflated to `bestThresholdScore * 0.7` where `bestThresholdScore` comes from "PAPRIKA GYERAN-JJIM"'s strong score (+0.18 bonuses)

...then "Faszerowana papryka" never enters `selected`, `pos0 = null`, and the protection is never triggered. The result is "PAPRIKA GYERAN-JJIM" alone.

**Root cause:** The first-line protection has a self-defeating design: it only activates when the correct first-line title has *already* survived the threshold independently. When the ALL_CAPS candidate inflates the threshold (via its bonuses) to a level the mixed-case title can't reach, the protection becomes a no-op. The protection is needed most precisely when the mixed-case title is outscored — but that is also when it cannot fire.

---

## Common Themes

### A. ALL_CAPS bias undermines correct mixed-case titles in bilingual recipes
The `+0.08` allCapsBonus and `+0.10` structuralBonus create a 0.18-point advantage for ALL_CAPS candidates. In bilingual cookbooks where the primary-language title is mixed-case and an ALL_CAPS romanisation or translation follows on the next line, this bonus systematically elevates the secondary subtitle over the actual title. The first-line protection was designed to compensate but fails when the all-caps advantage raises the threshold beyond the mixed-case title's reach.

### B. The first-line protection is a post-hoc bandage that depends on the problem it's meant to solve
The guard on lines 468–479 requires both candidates to be in `selected` before it can act. Its precondition — `pos0.score >= threshold` — means it only fires when the mixed-case title didn't need the protection in the first place. When the mixed-case title is genuinely outscored by the ALL_CAPS candidate (the case the protection targets), the guard silently skips, making it ineffective.

### C. Ingredient-bearing recipe titles are penalised by the HEADER_REFERENCE
Recipes named after their key components (e.g. "Baked Eggs with Feta, Harissa Tomato Sauce") have titles that semantically overlap with ingredient-list vocabulary. The embedding scorer cannot distinguish "this is the name of a dish that contains these ingredients" from "this is a fragment of an ingredient list". The rawScore formula `titleSim - max(headerSim, noiseSim)` provides no floor for candidates that pass all structural filters, meaning a legitimate title with modest differentiation can fall below threshold entirely.

### D. No fallback when the candidate pool is unambiguous
When there is exactly one candidate (or one dominant candidate that clearly passes all hard filters), the threshold mechanism can still discard it if the embedding similarity difference is too small. There is no "if only one candidate exists and it passed all structural filters, return it" safety net.

# Iteration 17 — Failure Analysis

## Failing case

- **File:** `Faszerowana papryka.real.txt`
- **Expected:** `Faszerowana papryka`
- **Got:** `WARZYWA`

---

## Document structure

```
Line  0: Faszerowana papryka          ← correct title (mixed-case)
Line  1: PAPRIKA GYERAN-JJIM          ← ALL_CAPS romanization
Line  2: 파프리카 계란찜                ← Korean script
Line  3: Ten bardzo prosty przepis…   ← body text
Line  5: NA 3 PAPRYKI                 ← serving-size metadata (filtered ✓)
Line  6: Przygotowanie                ← section label (filtered ✓)
Line  7: 10 minut                     ← time (filtered by startsWithNumber ✓)
Line  8: Pieczenie 30 minut           ← time line (passes hard filters!)
Line  9: SKŁADNIKI                    ← section label (filtered ✓)
Lines 10–17: ingredients
Lines 18–24: instructions (body text)
Line 25: WARZYWA                      ← chapter/category footer, wrong pick
```

---

## Why the failure occurs — step by step

### Step 1 — Bilingual detection fires on `PAPRIKA GYERAN-JJIM`

`Faszerowana papryka` is a mixed-case candidate at position 0. `PAPRIKA GYERAN-JJIM` is ALL_CAPS at position 1. The layout-based bilingual detector (Method 2) fires:

- `prePos0` = `Faszerowana papryka` (≥2 words, not ALL_CAPS) ✓
- `nearbyAllCaps` includes `PAPRIKA GYERAN-JJIM` at position 1
- `pos0Words` = `{"faszerowana", "papryka"}` — no words shared with `["paprika", "gyeran-jjim"]`
→ `PAPRIKA GYERAN-JJIM` is classified as a translation candidate and suppressed.

This part is **correct** behaviour. The title and its romanization are different words in different scripts.

### Step 2 — `firstStructuralHeading` becomes `undefined`

`PAPRIKA GYERAN-JJIM` was the only structural heading (ALL_CAPS, ≥2 words, every significant word ≥4 letters). After it is identified as a translation in Fix 2, `nonTranslationStructural` is empty, so `firstStructuralHeading = undefined`. No candidate receives the structural bonus (+0.10).

### Step 3 — `WARZYWA` passes all hard filters

`WARZYWA` (Polish: "vegetables") is a chapter/category footer on the last line. It passes every hard filter:

- Length 7 — between 3 and 80 ✓
- Not an ingredient ✓
- Does not start with a digit ✓
- Not in METADATA_PATTERNS ✓
- `isLikelyGarbled` — 7 letters, vowel ratio 3/7 ≈ 0.43 (within range), single word but 7 chars (> 3 threshold) ✓
- **Not in SECTION_LABELS** ✓ ← the root miss; "warzywa" is not listed

Because it is ALL_CAPS, it earns `allCapsBonus = 0.08`.

### Step 4 — Multi-title guard collapses to `WARZYWA`

Both `Faszerowana papryka` and `WARZYWA` survive the threshold filter. At the multi-title guard:

```
allCapsSelected = [WARZYWA]   ← exactly 1 ALL_CAPS survivor
→ selected = [highest scorer]
```

`WARZYWA` wins because:
- Its `allCapsBonus` (+0.08) elevates its score above `Faszerowana papryka`, which receives no bonus.
- `WARZYWA` is at the end of the document (relativePosition ≈ 1.0), so `positionFactor = 1.0` — no penalty for late position.
- `Faszerowana papryka` gets a mild position bonus (relativePosition 0 → positionFactor ≈ 1.12), but `rawScore × 0.12` is less than +0.08 if the embedding scores are close or if WARZYWA's rawScore is comparable.

---

## Root cause

### 1. `SECTION_LABELS` does not cover Polish chapter/category labels

"WARZYWA" (vegetables), and likely similar terms like "MIĘSO" (meat), "RYBY" (fish), "DESERY" (desserts), "ZUPY" (soups), etc., are common recipe-book chapter headers that appear as ALL_CAPS single-word footers or section dividers. They are not recipe titles. The set currently omits this entire category of labels.

### 2. The multi-title guard's "single ALL_CAPS → collapse to highest score" heuristic is positionally blind

When exactly one ALL_CAPS candidate survives alongside mixed-case candidates, the guard unconditionally collapses to the highest scorer. This conflates two distinct situations:
- The ALL_CAPS is the real title (e.g., `KREM SELEROWY Z GORGONZOLA`) — collapse is correct.
- The ALL_CAPS is a section/chapter label that happened to score marginally higher — collapse is wrong.

The guard does not check whether the ALL_CAPS candidate appears *after* all the recipe content (ingredients, instructions), which would be a strong signal it is a footer/category label rather than a title.

### 3. The `allCapsBonus` is unconditional for single-word terms

Single ALL_CAPS words like `WARZYWA` receive the full +0.08 bonus even though `isStructuralHeading` requires ≥2 words for the structural heading slot. The bonus amplifies a weak candidate without the safety check that applies to the structural heading pathway.

---

## Common theme

All three issues share the same underlying failure mode: **an ALL_CAPS bonus system designed to prefer recipe titles inadvertently elevates vocabulary-category labels** (chapter headings, section markers, footers) that are structurally indistinguishable from titles under the current filters. The document's actual title — clearly present on line 0 with strong positional evidence — is bypassed because the algorithm's ALL_CAPS preference is not guarded against labels that appear after the body content.

# Iteration 17 → 18 Improvement Plan

## Failure summary

| File | Expected | Got | Root cause |
|------|----------|-----|------------|
| Faszerowana papryka.real.txt | Faszerowana papryka | WARZYWA | ALL_CAPS category footer bypasses filters, wins on bonus |

---

## Root cause analysis

### RC-1: `SECTION_LABELS` missing Polish food-category chapter headers

"WARZYWA" (vegetables) is a chapter/category divider in a recipe book — structurally identical to "SKŁADNIKI" (ingredients) or "PRZYGOTOWANIE" (preparation), but from a different vocabulary. The current `SECTION_LABELS` set covers *recipe-internal* section labels (ingredients, instructions, tips) but not *book-level* category labels (vegetables, meats, soups, desserts).

These category labels appear as ALL_CAPS single words at page boundaries (typically last or first line). They are never recipe titles.

### RC-2: Multi-title guard collapses to highest score without positional awareness

When exactly 1 ALL_CAPS candidate survives alongside mixed-case candidates, the guard picks the highest scorer unconditionally (line 738):

```typescript
} else if (allCapsSelected.length === 1) {
  selected = [selected.reduce((a, b) => (a.score > b.score ? a : b))];
}
```

This conflates two situations:
- ALL_CAPS is the real title → collapse is correct
- ALL_CAPS is a footer/category label that scored marginally higher due to bonus → collapse is wrong

The guard has no concept of document structure: a label on the last line of the document (after all recipe content) should not beat a title on line 0.

### RC-3: `allCapsBonus` applies unconditionally to single-word ALL_CAPS

The +0.08 `allCapsBonus` fires for any ALL_CAPS text with ≥4 alpha characters (line 499). Single-word ALL_CAPS terms like `WARZYWA` receive the full bonus despite being ineligible for the `isStructuralHeading` slot (which requires ≥2 words). This amplifies weak category-label candidates enough to overtake legitimate titles.

### Common theme

All three root causes share one failure mode: **the ALL_CAPS preference system elevates vocabulary-category labels that are structurally indistinguishable from titles under current filters**. The actual title — on line 0 with strong positional signal — loses because the algorithm's ALL_CAPS bias is unguarded against labels appearing after body content.

---

## Proposed changes

### Change 1: Expand `SECTION_LABELS` with Polish food-category labels

**File:** `lib/text-classifier/title-extractor.ts` — `SECTION_LABELS` set

**What:** Add common Polish recipe-book chapter/category headers (stored without diacritics, matching existing convention).

**Before:**
```typescript
const SECTION_LABELS = new Set([
  // English
  "ingredients", "directions", "instructions", "method", "preparation",
  "steps", "notes", "tip", "tips", "variations", "variation",
  "garnish", "topping", "toppings", "frosting", "filling",
  // Polish (stored without diacritics for OCR resilience)
  "skladniki", "przygotowanie", "sposob przygotowania", "sposob wykonania",
  "wykonanie", "wskazowki", "podpowiedz", "warianty",
  "sos", "nadzienie", "polewa", "lukier", "ciasto",
]);
```

**After:**
```typescript
const SECTION_LABELS = new Set([
  // English
  "ingredients", "directions", "instructions", "method", "preparation",
  "steps", "notes", "tip", "tips", "variations", "variation",
  "garnish", "topping", "toppings", "frosting", "filling",
  // Polish — recipe section labels (stored without diacritics for OCR resilience)
  "skladniki", "przygotowanie", "sposob przygotowania", "sposob wykonania",
  "wykonanie", "wskazowki", "podpowiedz", "warianty",
  "sos", "nadzienie", "polewa", "lukier", "ciasto",
  // Polish — recipe-book chapter/category labels (food groups, meal types)
  "warzywa",          // vegetables
  "mieso",            // meat (mięso)
  "miesa",            // meats (mięsa)
  "ryby",             // fish
  "owoce morza",      // seafood
  "zupy",             // soups
  "salatki",          // salads (sałatki)
  "desery",           // desserts
  "napoje",           // drinks
  "pieczywo",         // bread/baked goods
  "przekaski",        // appetizers/snacks
  "sniadania",        // breakfasts (śniadania)
  "obiady",           // dinners/lunches
  "kolacje",          // suppers
  "makarony",         // pasta dishes
  "kasza",            // groats/grains
  "kasze",            // groats/grains (plural)
  "dania glowne",     // main courses (dania główne)
  "przystawki",       // starters
  "dodatki",          // side dishes
  "przetwory",        // preserves
  "wypieki",          // baked goods
  "ciasta",           // cakes (plural)
  "ciastka",          // cookies
  "torty",            // layer cakes
  "placki",           // pancakes/flatbreads
  "koktajle",         // cocktails/smoothies
]);
```

**Why this works:** Directly catches `WARZYWA` (normalized to `warzywa`) at the hard-filter stage. It never becomes a candidate, so the downstream scoring and guard logic never sees it.

**Risk:** Extremely low. These are generic food-category words, not dish names. No legitimate recipe title is just "WARZYWA" or "ZUPY".

### Change 2: Position-aware single-ALL_CAPS guard

**File:** `lib/text-classifier/title-extractor.ts` — multi-title guard block (~line 737)

**What:** When exactly 1 ALL_CAPS candidate survives alongside mixed-case candidates, check whether the ALL_CAPS candidate appears in the last 25% of the document. If so, prefer the highest-scoring candidate from the first half of the document instead. This catches category footers that slip past `SECTION_LABELS`.

**Before:**
```typescript
} else if (allCapsSelected.length === 1) {
  selected = [selected.reduce((a, b) => (a.score > b.score ? a : b))];
}
```

**After:**
```typescript
} else if (allCapsSelected.length === 1) {
  const theCapCandidate = allCapsSelected[0];
  const capRelPos = theCapCandidate.position / lines.length;
  // If the sole ALL_CAPS candidate is in the last 25% of the document,
  // it's likely a category footer, not a title. Prefer the best earlier candidate.
  if (capRelPos > 0.75) {
    const earlierCandidates = selected.filter(
      (s) => s.position / lines.length <= 0.75
    );
    if (earlierCandidates.length > 0) {
      selected = [earlierCandidates.reduce((a, b) => (a.score > b.score ? a : b))];
    } else {
      selected = [selected.reduce((a, b) => (a.score > b.score ? a : b))];
    }
  } else {
    selected = [selected.reduce((a, b) => (a.score > b.score ? a : b))];
  }
}
```

**Why this works:** Recipe titles appear at or near the top of the page. A single ALL_CAPS word at the very end of a recipe page (after ingredients and instructions) is almost always a section/category marker for the next chapter. This heuristic provides a structural safety net for category labels not in `SECTION_LABELS`.

**Risk:** Low. Legitimate ALL_CAPS titles at position >75% are rare — recipe titles appear at the top, not the bottom. Even if such a case exists, the candidate would need to be the *sole* ALL_CAPS survivor AND be competing with mixed-case candidates to trigger this path.

### Change 3: Reduce `allCapsBonus` for single-word candidates

**File:** `lib/text-classifier/title-extractor.ts` — allCapsBonus computation (~line 499)

**What:** Reduce the ALL_CAPS bonus from +0.08 to +0.03 for single-word candidates. Multi-word ALL_CAPS candidates keep the full +0.08.

**Before:**
```typescript
const allCapsBonus = isAllCaps(rs.text) && rs.text.replace(/[^a-zA-Z]/g, "").length >= 4
  ? 0.08
  : 0;
```

**After:**
```typescript
const allCapsBonus = isAllCaps(rs.text) && rs.text.replace(/[^a-zA-Z]/g, "").length >= 4
  ? (wordCount(rs.text) >= 2 ? 0.08 : 0.03)
  : 0;
```

**Why this works:** Single-word ALL_CAPS terms are overwhelmingly section/category labels, not recipe titles. Real recipe titles in ALL_CAPS are almost always multi-word ("KREM SELEROWY Z GORGONZOLA", "LABANEH BALLS WITH NIGELLA SEEDS"). Reducing the bonus for single words narrows the score gap between `WARZYWA` (+0.03) and `Faszerowana papryka` (no bonus but position factor ~1.12×), making the position factor decisive.

**Risk:** Low-moderate. If a legitimate single-word ALL_CAPS recipe title exists (e.g., "TZATZIKI"), it would still get +0.03 bonus plus potential structural heading bonus if applicable. The reduction from 0.08 to 0.03 is small enough that a genuinely title-like embedding score would still win.

---

## Defense-in-depth analysis

These three changes form concentric defensive layers:

| Layer | What it catches | When it fires |
|-------|----------------|---------------|
| **Change 1** (SECTION_LABELS) | Known Polish category labels | Hard filter — before scoring |
| **Change 3** (reduced bonus) | Unknown single-word ALL_CAPS labels | Scoring — reduces their competitive edge |
| **Change 2** (position guard) | Any ALL_CAPS footer that slips through | Multi-title guard — last-resort structural check |

For the `WARZYWA` case, Change 1 alone is sufficient. Changes 2 and 3 provide safety against future category labels not in the set (e.g., regional or specialized recipe-book sections).

---

## Expected impact

| Metric | Before | After |
|--------|--------|-------|
| Faszerowana papryka | FAIL (`WARZYWA`) | PASS (`Faszerowana papryka`) |
| All other 10 recipes | PASS | PASS (no regression expected) |
| **Accuracy** | **90.9% (10/11)** | **100% (11/11)** |

### Regression risk assessment

- **KREM SELEROWY Z GORGONZOLA** (multi-word ALL_CAPS title): Unaffected — multi-word candidates keep full +0.08 bonus; position is early in document.
- **LABANEH BALLS WITH NIGELLA SEEDS** (multi-word ALL_CAPS title): Unaffected — same reasons.
- **CHLEBEK Z WARZYWAMI I BOCZKIEM** (contains "WARZYWAMI"): Unaffected — "WARZYWAMI" ≠ "WARZYWA" and appears as part of multi-word title, not standalone.
- **Bilingual recipes** (Smażona zielona fasolka): Unaffected — translation detection runs independently of these changes.

### What could still fail in the future

- **Uncommon Polish category labels** not in the expanded set (e.g., "GRZYBY" = mushrooms, "JAJKA" = eggs). Mitigation: Change 2 (position guard) catches these structurally.
- **Recipe titles that are also food categories** (e.g., a recipe simply called "Zupy" for a specific soup). Mitigation: extremely unlikely — recipe titles are specific dish names, not generic food categories. If it does happen, the title would need to be ALL_CAPS + single word + in the last 25% of the page to be incorrectly filtered, which is an unlikely combination.

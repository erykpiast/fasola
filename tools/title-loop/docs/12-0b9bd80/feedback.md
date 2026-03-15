# Iteration 12 Failure Analysis

## Overview

17 failures across three distinct output patterns:
- Ingredient bullet lines: `- 2 jajka`, `- Sól do smaku`, `- Salt to taste`, `- 100g butter`
- Section header word: `INGREDIENTS`
- Compound ingredient lines: `- 100g butter - 100g butter + - Salt to taste`, `- Sól do smaku + - 2 jajka`

---

## Pattern 1: Ingredient bullet lines slip through hard filters

**Affected:** Barszcz Czerwony, Drożdżówki, Garlic Bruschetta, Grochówka, Makowiec, Oscypek, Piernik, Sernik, Spinach Dip, Strawberry Jam, Stuffed Mushrooms, Whole Wheat Bread

**Root cause: `looksLikeIngredient` only checks English measurement keywords.**

The function checks for: `cup`, `tbsp`, `tsp`, `oz`, `lb`, `gram`, `grams`, `kg`, `ml`, `liter`, etc.

This misses three categories of ingredient lines:
1. **Polish measurement units**: `łyżka` (tablespoon), `szklanka` (cup), `łyżeczka` (teaspoon), `szczypta` (pinch) — all absent from `MEASUREMENT_PATTERNS`. Lines like `- 1 łyżka cukru` pass as non-ingredients.
2. **No-unit qualitative ingredients**: `Salt to taste` / `Sól do smaku` have no measurement unit at all. Both English and Polish variants pass.
3. **Compact metric notation**: `100g butter` uses `g` (not `gram`/`grams`) and `1łyżka` without spaces. `g` alone is not in `MEASUREMENT_PATTERNS`.

**Root cause: `startsWithNumber` doesn't catch bullet-list lines.**

The check is `/^\s*\d/`. Lines starting with `- ` (hyphen-space) are not caught. Bullet points are a clear structural signal that a line is an ingredient or instruction item, but there is no `startsWithBullet` filter.

**Why these lines win in scoring:** When the correct ALL_CAPS title either fails threshold (low embedding score) or is eliminated by the multi-title guard, the fallback candidates are whatever survived hard filters. Ingredient bullet lines with no measurement keywords then compete—and with zero structural bonuses on the title, the highest-scoring candidate by embedding alone can be an ingredient line.

**Specific examples:**
- `Barszcz Czerwony.txt`: `- 2 jajka` (Polish "2 eggs") — no measurement keyword, starts with `- `, 5-letter word with acceptable vowel ratio — passes every filter.
- `Sernik.txt`, `Oscypek.txt`, `Grochówka.txt`: `- Sól do smaku` ("salt to taste") — same issue, no measurement keyword, `do` is in `commonShort2` so the garbled-word check doesn't fire.
- `Garlic Bruschetta.txt`, `Spinach Dip.txt`, etc.: `- Salt to taste` — same mechanism in English.

---

## Pattern 2: `INGREDIENTS` returned instead of the actual title

**Affected:** Mozzarella Sticks

**Root cause: `isSubHeader` misidentifies the actual title as a section sub-header.**

The file structure is:
```
INGREDIENTS           ← ALL_CAPS, position 0
MOZZARELLA STICKS     ← ALL_CAPS, position 2
- 2 tbsp sugar        ← contains "tbsp" → looksLikeIngredient = true
```

The multi-title guard fires when `allCapsSelected.length >= 2`. Both `INGREDIENTS` (1 word) and `MOZZARELLA STICKS` (2 words) are ALL_CAPS and survive threshold.

`isSubHeader` checks `sortedCaps.slice(1)` — i.e., every ALL_CAPS heading except the first. Here, `MOZZARELLA STICKS` is sortedCaps[1]. Its next 2 lines include `- 2 tbsp sugar` which contains `tbsp` → `looksLikeIngredient` = true → `isSubHeader` = true.

Result: `selected = [sortedCaps[0]]` = `INGREDIENTS`.

**The guard assumes the first ALL_CAPS heading is a recipe title, but on these pages the first ALL_CAPS heading is a section label (`INGREDIENTS`) and the actual title follows it.** When a section label precedes the title in document order, `isSubHeader` invariably promotes the wrong heading.

This only fired on Mozzarella Sticks (not the similar Polish files) because the ingredient immediately after the title contained `tbsp` — a recognized measurement keyword. In the Polish files, the first ingredient after the Polish title typically lacks a recognized keyword (e.g. `- 2 jajka`), so `isSubHeader` doesn't fire and a different failure mode takes over.

---

## Pattern 3: Multiple ingredient lines joined with `+`

**Affected:** Blackberry Jam (`- 100g butter - 100g butter + - Salt to taste`), Duck Confit (same), Kielbasa (`- Sól do smaku + - 2 jajka`), Zupa Żurawina (same)

**Root cause: Repeated ingredient lines produce a 2-line join candidate that also passes hard filters, and zero ALL_CAPS survivors allow all candidates through.**

Duck Confit and Blackberry Jam both contain consecutive duplicate ingredient lines:
```
- 100g butter
- 100g butter
```
The `buildCandidates` 2-line join produces `- 100g butter - 100g butter`. This passes `passesHardFilters` because:
- `100g` doesn't match any measurement keyword (no bare `g`)
- Doesn't start with digit
- Vowel ratio of `gbutterbutterr` ≈ 0.27 — acceptable
- No garbled short lowercase words that aren't in `commonShort2`

The result `- 100g butter - 100g butter` AND `- Salt to taste` both survive threshold. With zero ALL_CAPS candidates in `selected`, the multi-title guard takes the `allCapsSelected.length === 0` branch and **keeps all candidates**. Two ingredient candidates are joined into the output.

For Kielbasa/Zupa Żurawina, the same logic applies with `- Sól do smaku` and `- 2 jajka` as separate survivors.

---

## Common Themes

### 1. Ingredient detection is incomplete
`looksLikeIngredient` is English-only and only matches lines with explicit measurement units. It needs at minimum:
- Polish measurement units (`łyżka`, `szklanka`, `łyżeczka`, `szczypta`, `garść`)
- Compact metric (`g`, `ml` as standalone tokens, not just as part of `gram`/`liter`)
- A "to taste" / "do smaku" pattern as a catch-all for no-unit ingredients

### 2. Bullet-line marker is not a filter signal
Every recipe ingredient bullet starting with `- ` (or `•`) bypasses all filters. Adding a check for lines starting with `- ` (dash-space) would eliminate this entire class of false candidates.

### 3. `isSubHeader` assumes section labels precede titles
The guard assumes `sortedCaps[0]` (the first ALL_CAPS line) is the recipe title. When the document layout is `SECTION_LABEL → TITLE → ingredients`, the guard demotes the title and promotes the label.

### 4. Zero-ALL_CAPS fallback keeps all survivors
When no ALL_CAPS heading survives threshold, the `allCapsSelected.length === 0` branch outputs all surviving candidates joined with `+`. If the ingredient filter fails, this produces multi-ingredient garbage output.

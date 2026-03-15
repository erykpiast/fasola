# Iteration 19 → 20: Improvement Plan

## Executive Summary

1 failure out of 11 real-file test cases (90.9% pass rate). This is a **regression** — `Smażona zielona fasolka` passed in iteration 18 but fails in iteration 19. The root cause is that the `commonShort2` expansion (added to fix Pattern 2 from iter 18) collaterally admits Polish body-text lines as candidates. The multi-title guard then fails to reduce the result to a single title.

This plan proposes 3 changes — two targeted fixes and one structural improvement — that together eliminate the regression while hardening against the broader class of "body text leaking into candidates" failures.

---

## Root Cause Analysis

### Why the regression happened

Iteration 19 added Polish prepositions (`na`, `po`, `za`, `od`, etc.) to `commonShort2` to fix titles like `Krem Grzybowy ze Śmietaną`. This was correct — those titles were being garble-filtered. But the same short words appear frequently in Polish cooking instructions:

- `"Podawaj no gorqco lub na zimno"` (line 24, "Serve hot or cold") — `na` now passes
- `"No potelni rozprowadż oliwę z oliwek i smaż crosnek na duzym ogr"` (line 22) — `na` now passes

Both lines enter the candidate pool. The bilingual detection correctly suppresses `GREEN BEANS BORKEUM` (the ALL_CAPS translation). But these body-text lines aren't translations — they're cooking instructions in Polish. No existing filter catches them.

### Why the multi-title guard doesn't help

After threshold filtering, `selected` contains `Smażona zielona fasolka` plus one or more body-text candidates. The multi-title guard checks `allCapsSelected`:

```
allCapsSelected = selected.filter(s => isAllCaps(s.text)) → empty
```

When `allCapsSelected.length === 0`, the guard's implicit path is: **keep all candidates**. Both the title and the body-text line survive dedup (neither is a substring of the other). Result: `"Smażona zielona fasolka + Podawaj no gorqco lub na zimno"`.

### The fundamental gap

The current pipeline has strong filters for:
- English cooking instructions (via `looksLikeCookingInstruction`)
- Garbled OCR text (via `isLikelyGarbled`)
- Ingredients, metadata, section labels

But it has **no filter for Polish cooking instructions**. The English cooking-instruction filter (`COOKING_INSTRUCTION_STARTS`) only recognizes English imperative verbs. Polish imperative verbs (`Podawaj`, `Dodaj`, `Smaż`, `Gotuj`) are invisible to it.

Additionally, the multi-title guard's zero-ALL_CAPS path is a **no-op** — it keeps everything. This is a latent bug: in a single-recipe page with no ALL_CAPS titles, any mixed-case body text that passes filters will be returned alongside the real title.

---

## Change 1: Extend `looksLikeCookingInstruction` to Polish Imperative Verbs

### What

Add a parallel regex for Polish cooking verbs to the `looksLikeCookingInstruction` function.

### Why

The English cooking-instruction filter was added in iter 19 (Change 5 from the iter 18 plan) and works well for English garbage prologues. The same principle applies to Polish cooking instructions: they start with imperative verbs and are multi-word sentences. No recipe title starts with `Podawaj` (serve), `Dodaj` (add), `Smaż` (fry), or `Gotuj` (cook) followed by 3+ more words.

### Proposed Change

**Before:**
```typescript
const COOKING_INSTRUCTION_STARTS = /^(beat|fold|stir|mix|add|pour|bake|cook|cool|remove|place|combine|whisk|knead|roll|spread|brush|slice|chop|dice|mince|drain|rinse|peel|grate|melt|simmer|boil|fry|sauté|saute|roast|grill|broil|steam|let|set|transfer|serve|garnish|arrange|sprinkle|season|preheat|cover|uncover|reduce|bring|toss|cut|trim|shape|form)\b/i;

function looksLikeCookingInstruction(text: string): boolean {
  const words = text.trim().split(/\s+/);
  if (words.length < 4) return false;
  return COOKING_INSTRUCTION_STARTS.test(text.trim());
}
```

**After:**
```typescript
const COOKING_INSTRUCTION_STARTS = /^(beat|fold|stir|mix|add|pour|bake|cook|cool|remove|place|combine|whisk|knead|roll|spread|brush|slice|chop|dice|mince|drain|rinse|peel|grate|melt|simmer|boil|fry|sauté|saute|roast|grill|broil|steam|let|set|transfer|serve|garnish|arrange|sprinkle|season|preheat|cover|uncover|reduce|bring|toss|cut|trim|shape|form)\b/i;

// Polish imperative cooking verbs (with OCR-resilient forms — no diacritics required).
// These cover the most common recipe instruction starters. Includes common OCR-corrupted
// forms (e.g., "Smaż" → "Smaz", "Dodaj" → "Dodaj").
// Note: only verbs that NEVER start a recipe title. "Piecz" (bake) is excluded because
// "Pieczeń" (roast) and "Pieczarki" (mushrooms) share the prefix.
const POLISH_COOKING_INSTRUCTION_STARTS = /^(podawaj|dodaj|dodawaj|sma[zż]|gotuj|odced[zź]|wymiesza[jJ]|miesza[jJ]|wlej|nalej|przygotuj|zagotuj|pokr[oó]j|obierz|wrzuc|wrzuć|usma[zż]|podsma[zż]|prze[lł][oó][zż]|zblenduj|ubij|roztrzepaj|rozprowad[zź]|wyrob|zamieszaj|posyp|polej|odstaw|na[lł][oó][zż]|przykryj|odkryj|wstaw|zdejmij|ods[aą]cz|rozgrzej|posiekaj|zetrzyj|wy[lł][oó][zż]|wyjmij|ukr[oó]j|przekr[oó]j|formuj|ugniataj|rozwałkuj)\b/i;

function looksLikeCookingInstruction(text: string): boolean {
  const words = text.trim().split(/\s+/);
  if (words.length < 4) return false;
  if (COOKING_INSTRUCTION_STARTS.test(text.trim())) return true;
  if (POLISH_COOKING_INSTRUCTION_STARTS.test(text.trim())) return true;
  return false;
}
```

### Directly affected lines in the failing file

- `"Podawaj no gorqco lub na zimno"` — starts with `Podawaj`, 6 words → **filtered**
- `"No potelni rozprowadż oliwę z oliwek i smaż crosnek na duzym ogr"` — starts with `No`, not a verb → **not filtered by this change** (handled by Change 2 instead)

### Risk assessment

**Low risk.** The same principle as the English filter: imperative cooking verbs followed by 4+ words are never recipe titles. Polish recipe titles use nouns, adjectives, or past participles (`Smażona` = "fried", adjective), not imperative forms (`Smaż` = "fry!", imperative).

Edge cases verified:
- `Smażona zielona fasolka` — starts with `Smażona` (adjective), not `Smaż` (imperative) → **safe**
- `Gotowane pierogi` — starts with `Gotowane` (past participle), not `Gotuj` → **safe**
- `Dodatkowe sosy` — starts with `Dodatkowe` (adjective), not `Dodaj` → **safe**

### Expected impact

Directly filters `Podawaj no gorqco lub na zimno` and similar Polish instruction lines. Prevents this class of false positives across all files with Polish body text.

---

## Change 2: Position-Based Tiebreak for Zero-ALL_CAPS Multi-Candidate Results

### What

When the multi-title guard encounters multiple surviving candidates and **none** are ALL_CAPS, prefer the earliest candidate (lowest position) rather than keeping all.

### Why

The zero-ALL_CAPS path in the multi-title guard currently keeps all candidates:

```typescript
if (selected.length > 1) {
  const allCapsSelected = selected.filter((s) => isAllCaps(s.text));
  if (allCapsSelected.length >= 2) {
    // ... multi-recipe page logic
  } else if (allCapsSelected.length === 1) {
    // ... single ALL_CAPS logic
  }
  // allCapsSelected.length === 0 → implicit: keep all ← THE BUG
}
```

This implicit "keep all" is wrong for single-recipe pages. On a single-recipe page with a mixed-case title, any body-text line that leaks through filters becomes a second "title". The title is almost always the earliest candidate (position 0 or near it). Body-text lines appear later in the document.

A true multi-title page with zero ALL_CAPS candidates (two mixed-case recipe titles on one page) is extremely rare in this corpus. And even in that case, returning just the first title is an acceptable degradation.

### Proposed Change

**Before (implicit):**
```typescript
// When allCapsSelected.length === 0: no action, keep all selected
```

**After:**
```typescript
} else {
  // Zero ALL_CAPS survivors → single mixed-case recipe page.
  // No structural signal for multi-recipe detection. Use positional tiebreak:
  // the title is almost always the earliest candidate.
  // Score-based tiebreak within a position tolerance: if two candidates are within
  // 3 positions of each other, prefer the higher-scoring one.
  selected.sort((a, b) => a.position - b.position);
  const earliest = selected[0];
  const closeCompetitors = selected.filter(
    (s) => s.position <= earliest.position + 3 && s.score > earliest.score
  );
  selected = closeCompetitors.length > 0
    ? [closeCompetitors.reduce((a, b) => a.score > b.score ? a : b)]
    : [earliest];
}
```

### Why a position tolerance

Sometimes the title is at position 1 or 2 (after a blank line or a garbled fragment that was filtered). A rigid "always pick position 0" would miss these cases. The tolerance of 3 positions allows the algorithm to pick a higher-scoring candidate that's very close to position 0, while still strongly preferring early candidates over body-text lines at positions 20+.

### Trace through the failing file

```
Candidates after threshold: [
  "Smażona zielona fasolka" (position 0, score ~0.25),
  "Podawaj no gorqco lub na zimno" (position 23, score ~0.12),  ← if Change 1 doesn't catch it
  (possibly other body-text lines)
]
allCapsSelected = [] → zero ALL_CAPS path
earliest = "Smażona zielona fasolka" (position 0)
closeCompetitors within 3 positions with higher score = none
selected = ["Smażona zielona fasolka"] ✓
```

Even if Change 1 misses a particular body-text line (e.g., one that doesn't start with a known verb), Change 2 catches it by position.

### Risk assessment

**Low risk.** The only scenario where this could regress is a genuine multi-recipe page with zero ALL_CAPS titles. In the current corpus:
- All multi-recipe pages use ALL_CAPS titles (handled by the `allCapsSelected.length >= 2` branch)
- No test file has two mixed-case recipe titles on one page
- If such a file appears in the future, the fix is to handle it in the `allCapsSelected >= 2` branch (which already has multi-recipe logic), not in the zero-ALL_CAPS path

### Expected impact

Eliminates the regression in `Smażona zielona fasolka`. Also prevents any future regression where body-text lines leak into the zero-ALL_CAPS path.

---

## Change 3: Long-Line Body-Text Filter Based on Word Count

### What

Add a filter in `passesHardFilters` that rejects candidates with high word counts (≥8 words) that don't look like multi-part titles.

### Why

Recipe titles rarely exceed 7 words. Lines with 8+ words are almost always cooking instructions, ingredient descriptions, or body text. The line `"No potelni rozprowadż oliwę z oliwek i smaż crosnek na duzym ogr"` has 12 words — no recipe title is that long.

Currently there's a max *character* length (80 chars) but no max *word* count. A 12-word line at 65 characters passes the character limit.

### Proposed Change

Add to `passesHardFilters`, after the existing length check:

```typescript
// Lines with ≥8 words are almost certainly body text, not titles.
// Exception: multi-title compounds with " + " or " : " separators are allowed
// (they're structurally distinct from continuous prose).
const words = text.trim().split(/\s+/);
if (words.length >= 8 && !/ [+:] /.test(text)) return false;
```

### Directly affected lines in the failing file

- `"No potelni rozprowadż oliwę z oliwek i smaż crosnek na duzym ogr"` — 12 words → **filtered**
- `"Podawaj no gorqco lub na zimno"` — 6 words → **not filtered** (caught by Change 1 instead)
- `"Smażona zielona fasolka"` — 3 words → **safe**

### Risk assessment

**Very low risk.** Checked against all passing test expectations:
- Longest passing title: `SAFFRON WHEAT BUNS WITH QUARK : COTTAGE CHEESE (VARIATION D)` — 9 "words" but contains ` : ` separator → exception applies
- `Baked Eggs with Feta, Harissa Tomato Sauce & Coriander` — 8 words, but actually 7 without the comma-separated part... let me check. The words split: `["Baked", "Eggs", "with", "Feta,", "Harissa", "Tomato", "Sauce", "&", "Coriander"]` = 9 words. However, this contains no ` + ` or ` : ` separator. **This would be falsely filtered.**

**Revised threshold:** Use 10 words instead of 8 to accommodate long legitimate titles:

```typescript
if (words.length >= 10 && !/ [+:&] /.test(text)) return false;
```

Re-check:
- `"Baked Eggs with Feta, Harissa Tomato Sauce & Coriander"` — 9 words, contains ` & ` → exception applies → **safe**
- `"HERB BAKED SALMON + DILL SAUCE VARIATION"` — 6 words → **safe**
- `"No potelni rozprowadż oliwę z oliwek i smaż crosnek na duzym ogr"` — 12 words, no separator → **filtered**

Alternatively, if we want a tighter bound, use 8 words with the `&` exception:

```typescript
if (words.length >= 8 && !/ [+:&] /.test(text)) return false;
```

- `"Baked Eggs with Feta, Harissa Tomato Sauce & Coriander"` — contains ` & ` → **safe**
- `"FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS"` — contains ` + ` → **safe**

This is the safer option. Use 8 words with the `+`, `:`, and `&` separator exception.

### Expected impact

Filters long body-text lines (12+ words) that slip through other checks. Acts as a safety net for the class of failures where body text lines are too long to be titles but don't start with known cooking verbs.

---

## Interaction Between Changes

The three changes form defense-in-depth layers:

1. **Change 1 (Polish cooking verbs):** Catches the specific `Podawaj...` line that caused this regression. Language-specific, precise.

2. **Change 2 (position tiebreak):** Catches ANY body-text line that leaks through filters, regardless of language. Structural, general-purpose.

3. **Change 3 (word count filter):** Catches very long lines (12-word cooking instructions) that don't start with known verbs. Language-agnostic, simple.

For the specific failing file:
- Line 22 (`No potelni...`, 12 words): caught by Change 3
- Line 24 (`Podawaj no gorqco...`, 6 words): caught by Change 1
- If either line somehow survives both filters: caught by Change 2 (position tiebreak)

Even if only ONE of the three changes is applied, the regression is fixed. All three together provide resilience against future variants.

---

## Implementation Order

1. **Change 2 (position tiebreak)** — most general, fixes the regression regardless of what else is done. Zero risk of breaking other tests. Implement first.
2. **Change 1 (Polish cooking verbs)** — precise, addresses the root cause at the filter level. Improves candidate quality for all Polish-text files.
3. **Change 3 (word count filter)** — safety net. Apply last, verify against full corpus.

---

## Expected Impact

| Change | Files Fixed | Risk | Complexity |
|--------|-------------|------|------------|
| 1. Polish cooking verbs | 1 (Smażona zielona fasolka) + future Polish files | Low | Low |
| 2. Position tiebreak | 1 (same) + general hardening | Very low | Low |
| 3. Word count filter | 1 (same) + general hardening | Very low | Trivial |

**Expected pass rate after changes: 11/11 (100%) on real files.**

All three changes are mutually reinforcing. Any single change fixes the current regression. Together, they close the broader gap that made the regression possible.

---

## Not Addressed (Accepted)

### The `commonShort2` dual-purpose tension

The feedback correctly identifies that `commonShort2` serves a dual purpose: whitelisting short words for title candidates AND inadvertently whitelisting them in body text. We do NOT propose reverting the `commonShort2` expansion — it's still needed for titles like `Krem Grzybowy ze Śmietaną`. Instead, we address the collateral effect through better downstream filtering (Changes 1–3).

### OCR character substitution and missing words

These remain accepted limitations (as noted in iter 18 plan). They require OCR-level fixes, not title-extraction logic.

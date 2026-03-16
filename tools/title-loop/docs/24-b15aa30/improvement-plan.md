# Iteration 24 → 25 Improvement Plan

## Executive Summary

18 failures across 7 patterns. The core issue is that the extractor's confidence model is
too fragile: it rejects plausible title candidates (especially OCR-corrupted ones) without
a reliable fallback, and its OCR normalization applies digit→letter substitutions without
considering what letter actually makes sense in context.

The plan addresses failures in three layers:
1. **Pre-candidate OCR repair** — fix corrupted text *before* candidate scoring, not after
2. **Category-header bypass** — skip known non-title preamble lines before candidate generation
3. **Positional confidence floor** — trust the first plausible candidate more aggressively

---

## Pattern 1: OCR digit-for-letter — partial correction (4 failures)

### Root Cause

`normalizeOcrTitle()` runs *after* candidate selection and applies blind substitutions:
`1→I` in ALL_CAPS, then title-cases the result. But title-casing converts `I` to `i` in
non-initial positions, producing "Aruguia" instead of "Arugula". The function doesn't know
that `1` in "ARUGU1A" should become `L` (not `I`), because it has no dictionary or
context awareness.

The fundamental flaw: **digit→letter mapping is ambiguous without word-level context**.
`1` can be `I`, `L`, or `l` depending on the word. Post-hoc substitution on the final
title string can't resolve this ambiguity.

### Proposed Fix: Dictionary-guided OCR repair

Replace the blind `1→I` / `0→O` substitution in `normalizeOcrTitle()` with a
dictionary-lookup approach:

1. **Build a compact food-word dictionary** (~500 words): common English and Polish recipe
   words (ingredients, cooking terms, food names). Store lowercase forms.
   File: `lib/text-classifier/food-dictionary.ts`

2. **For each word in the title**, enumerate possible digit→letter substitutions
   (`1→i`, `1→l`, `0→o`, `4→a`, `5→s`, `¡→i`, `Í→i`). Check if any substitution
   produces a dictionary match. If yes, use that form. If no match, fall back to the
   current heuristic (positional/case-based).

3. **Apply repair before title-casing**, so the casing step receives clean words.

#### Before / After

```
Input:  "BEET ARUGU1A SA1AD"
Before: 1→I → "BEET ARUGULA SALAD" → title-case → "Beet Aruguia Saiad" ✗
After:  "ARUGU1A" → try "ARUGULA" (dict match) ✓ → "Beet Arugula Salad" ✓

Input:  "B1ACKBERRY FOO1"
Before: 1→I → "BIACKBERRY FOOI" → title-case → "Biackberry Fooi" ✗
After:  "B1ACKBERRY" → try "BLACKBERRY" (dict match) ✓, "FOO1" → try "FOOL" (dict match) ✓

Input:  "CH1EB PSZENNY RAZOWY"
Before: 1→I → "CHIEB" → title-case → "Chieb" ✗
After:  "CH1EB" → try "CHLEB" (dict match) ✓ → "Chleb Pszenny Razowy" ✓

Input:  "LEMON HERB GRILÍED CHICKEN"
After:  "GRILÍED" → try "GRILLED" (dict match) ✓
```

#### Implementation Notes

- Dictionary should be a `Set<string>` of lowercase words, loaded once at module init.
- For each candidate word, generate all single-digit and multi-digit substitution variants
  (bounded: max ~8 substitutions per word, max ~256 combinations for 8 digits — but in
  practice recipe words have 0-2 digit substitutions).
- To keep it fast, only attempt substitutions when the word contains a known OCR-artifact
  character (`0-9`, `¡`, `Í`, `€`).
- The dictionary doesn't need to be exhaustive — it's a positive signal ("I know this word"),
  not a negative one. Unknown words fall through to the existing heuristic.

### Expected Impact

Fixes all 4 Pattern 1 failures. Also improves Pattern 7 (Placki Ziemniaczane) where
"SKLADNIK1" → "SKŁADNIKI" would be recognized as a section label rather than noise.

---

## Pattern 2: OCR corruption annotation confuses extractor (5 failures)

### Root Cause

The `(OCR CORRUPTION: ...)` annotation on line 3 is correctly filtered by
`passesHardFilters`. But the *title line itself* (e.g., "Bra1sed Cod w1th Wh1te W1ne")
contains digits that cause it to be rejected — not by `passesHardFilters` directly,
but by the embedding scoring. The OCR-corrupted title has poor semantic similarity to
the "recipe name" reference, pushing its rawScore below threshold. The extractor then
falls through to body text or returns empty.

The secondary issue: `isLikelyGarbled` may reject some corrupted titles because
digit-interspersed words fail the vowel-ratio check or trigger the "garbled word" detector.

### Proposed Fix: Pre-scoring OCR repair on candidates

Apply the dictionary-guided OCR repair (from Pattern 1 fix) **before embedding**, not after.
This means candidates enter the scoring pipeline as clean text, getting proper embedding
similarity scores.

Specifically, in `buildCandidates` or at the start of `extractTitleWithEmbeddings`:

1. For each candidate text, apply the dictionary-guided repair function.
2. Store both the original text (for position tracking) and the repaired text (for embedding).
3. Embed the **repaired** text. Return the **repaired** text as the result.

This also helps `isLikelyGarbled` and `passesHardFilters`: repair the text before
running filters, so "1ngredients" becomes "Ingredients" (→ section label → filtered),
and "Bra1sed Cod w1th Wh1te W1ne" becomes "Braised Cod with White Wine" (→ passes
all filters, embeds well).

#### Before / After

```
Input line: "Bra1sed Cod w1th Wh1te W1ne"
Before: Poor embedding → rawScore below threshold → empty result
After:  Repaired to "Braised Cod with White Wine" → strong embedding → selected ✓

Input line: "Drożdże Sern1k"
Before: "Sern1k" → poor embedding → falls to body text
After:  Repaired to "Drożdże Sernik" → strong embedding → selected ✓
```

### Expected Impact

Fixes all 5 Pattern 2 failures. Also indirectly helps Pattern 7.

---

## Pattern 3: Category/section header precedes the actual title (3 failures)

### Root Cause

The three cases have different preamble styles:

1. **"FISH & SEAFOOD"** — already in `SECTION_LABELS` → filtered. But the real title
   "Halibut with Saffron Cream Sauce" (mixed-case, position 2) competes poorly because
   the structural heading logic finds no ALL_CAPS heading to anchor on. The extractor
   falls through to body text.

2. **"VEGETABLES"** — already in `SECTION_LABELS` → filtered. Same scoring problem.

3. **"Lato | Zupy | DLA 4 OSÓB | ..."** — filtered by `" | "` check. But then
   "OGÓRKOWA ZUPA" at position 2 should be found as an ALL_CAPS candidate.

For cases 1 and 2, the issue is that after the category header is filtered, the
mixed-case title at position 2 doesn't score high enough. There's no "first non-filtered
candidate gets a position boost" logic — the position factor only rewards position 0 in
the raw line array, not position 0 among surviving candidates.

For case 3 (Ogórkowa Zupa returning empty), the pipe-delimited metadata line is at
position 0, and "OGÓRKOWA ZUPA" is at position 2. The metadata line consumes line 0,
and there's likely a failure in `findBurstEnd` to skip it — or the ALL_CAPS title
at position 2 isn't getting enough structural heading bonus because position 0 is gone.

### Proposed Fix: Candidate-relative position bonus

Change the position factor calculation from raw line position to **candidate-relative
position** — i.e., position among candidates that passed hard filters:

```typescript
// Current: position in raw lines
const relativePosition = rs.position / lines.length;

// Proposed: position among surviving candidates (0.0 for first candidate)
const candidateIndex = candidates.findIndex(c => c.text === rs.text);
const candidateRelativePosition = candidateIndex / candidates.length;
```

This way, when "FISH & SEAFOOD" is filtered, "Halibut with Saffron Cream Sauce" becomes
the first surviving candidate and gets the maximum position bonus.

Additionally, add a **"first candidate after filtered preamble" bonus**: when the first
N lines are all filtered (section labels, metadata, page refs), the first surviving
candidate should get an explicit bonus (e.g., +0.08) because it occupies the structural
"title position" in the document.

#### Before / After

```
"FISH & SEAFOOD" (filtered) / "Halibut with Saffron Cream Sauce" (position 2)
Before: position factor = 1.0 + 0.12 * (1 - 2/50*2) = ~1.11 — modest boost
After:  first-surviving-candidate bonus = +0.08, candidateRelativePosition = 0.0

"Lato | Zupy | ..." (filtered) / "OGÓRKOWA ZUPA" (position 2)
Before: structural heading bonus applies but threshold may be too high
After:  first-surviving-candidate bonus ensures it clears threshold
```

### Expected Impact

Fixes all 3 Pattern 3 failures.

---

## Pattern 4: Title absent from captured text (2 failures)

### Root Cause

When the OCR capture starts mid-recipe (no title present), the extractor should ideally
return empty. Instead:

- **Mushroom Risotto**: picks up "CARPACCIO DI PESCE SPADA + CARPACCIO WITH CITRUS DRESSING"
  — the title of the *next* recipe in the same file. These are ALL_CAPS structural headings
  that score well.

- **Sweet Potato Salad**: picks up "Salt and pepper" — a short phrase that passes hard filters.

### Proposed Fix: Detect title-absent pages

Add a "no-title confidence check": when the best candidate's rawScore is below a minimum
absolute threshold (e.g., 0.05) AND the candidate is not in the first 3 non-empty lines,
return empty rather than guessing.

More specifically:
1. If the file starts with ingredient-like lines or cooking instructions (detected by
   `looksLikeIngredient` or `looksLikeCookingInstruction` on the first 3 non-empty lines),
   flag the page as "title-absent candidate".
2. In this mode, require a higher rawScore threshold (e.g., 0.10) for any candidate to
   be accepted.
3. For the Mushroom Risotto case: the best candidate ("CARPACCIO DI PESCE SPADA...") is
   at position 4 (deep in the file after body text) and the file starts with body text —
   the title-absent detection should prevent selection.

#### Before / After

```
Mushroom Risotto: starts with "Reduce heat and stir..."
Before: selects "CARPACCIO DI PESCE SPADA + CARPACCIO WITH CITRUS DRESSING"
After:  first 3 lines are cooking instructions → title-absent mode → returns empty ✓

Sweet Potato Salad: starts with "2 large sweet potatoes..."
Before: selects "Salt and pepper"
After:  first 3 lines are ingredients → title-absent mode → returns empty ✓
```

### Expected Impact

Fixes both Pattern 4 failures. Returning empty is the correct behavior when no title
exists in the captured text.

---

## Pattern 5: Compound title — only variation extracted (2 failures)

### Root Cause

The compound title "HERB ROASTED PORK WITH MUSHROOMS : PORK WITH CARAMELIZED ONIONS (VARIATION)"
is on line 1. It should pass hard filters (the ` : ` exception for colon-terminated lines
exists at line 306). But the extractor returns "--VARIATION: PORK WITH CARAMELIZED ONIONS",
which looks like a section header from later in the file.

Looking at the file: line 1 has the compound title, line 3 has "MAIN RECIPE: HERB ROASTED
PORK WITH MUSHROOMS". The issue is that line 1 has 10 words — exceeding the 8-word limit
in `passesHardFilters` (line 324). The exception `/ [+:&/] /` is checked, but ` : ` in
this title means `+` and `&` don't match. Let me re-read... the regex is `/ [+:&/] /` —
that's a character class `[+:&/]`, so `:` IS included. So the 8-word filter should be
bypassed.

Wait — counting: "HERB ROASTED PORK WITH MUSHROOMS : PORK WITH CARAMELIZED ONIONS (VARIATION)"
= "HERB", "ROASTED", "PORK", "WITH", "MUSHROOMS", ":", "PORK", "WITH", "CARAMELIZED",
"ONIONS", "(VARIATION)" = 11 words. The check is `words.length >= 8 && !/ [+:&/] /.test(text)`.
The text contains " : " so the exception fires — this should pass.

But wait, the `stripParentheticalGloss` function strips "(VARIATION)" because the base
"HERB ROASTED PORK WITH MUSHROOMS : PORK WITH CARAMELIZED ONIONS" is ALL_CAPS and
"VARIATION" is ALL_CAPS → the function keeps it (line 397: `if (isAllCaps(paren)) return text`).
So the full title should survive.

The most likely cause: the line is > 80 characters. Let me count:
"HERB ROASTED PORK WITH MUSHROOMS : PORK WITH CARAMELIZED ONIONS (VARIATION)" = 77 chars.
Under 80, so it passes the length check.

Re-examining: the feedback says the extractor returns "--VARIATION: PORK WITH CARAMELIZED ONIONS".
The `--` prefix suggests this comes from a line deeper in the file that starts with `--`.
Let me look at the actual file content more carefully.

Actually, looking at the file again — line 1 *does* pass hard filters, so it enters the
candidate pool. The issue must be in the scoring/dedup phase. The line 3 candidate
"MAIN RECIPE: HERB ROASTED PORK WITH MUSHROOMS" ends with no colon issue... wait, it
ends without `:` at the end. But "MAIN RECIPE:" at the start — does this get filtered?
No, it's not a section label or metadata pattern.

The dedup logic (line 1044): "if one title is a substring of another, keep the shorter one."
"HERB ROASTED PORK WITH MUSHROOMS" (from line 3, after stripping "MAIN RECIPE: ") may
be a substring of the compound title. The dedup would keep the shorter one, destroying
the compound title.

**This is the real bug**: the "shorter wins" dedup rule is designed to prevent
"Pierogi Ruskie 200g mąki" from beating "Pierogi Ruskie", but it also causes
"HERB ROASTED PORK WITH MUSHROOMS" to beat the full compound title.

For the PIERNIK case: "PIERNIK TRADYCYJNY + PIERNIK NOWOCZESNY Z CZEKOLADĄ" on line 1,
and likely "WERSJA NOWOCZESNA Z CZEKOLADĄ" or similar from a later section header.
The `+` exception in the 8-word filter should let the compound title through. But
if a sub-section header like "PIERNIK NOWOCZESNY Z CZEKOLADĄ" appears later and is
a substring of the compound title, dedup kills the compound title.

### Proposed Fix: Protect compound titles from substring dedup

Add compound-title protection to the dedup step: when a candidate contains ` : ` or ` + `
(compound separator), it should not be removed by shorter-substring dedup. The compound
form is the intended complete title.

```typescript
// In the dedup filter, skip removal if the longer candidate is a compound title
selected = selected.filter((a) => {
  const aLower = a.text.toLowerCase();
  // Protect compound titles from substring dedup
  if (/ [+:] /.test(a.text)) return true;
  return !selected.some(
    (b) =>
      b !== a &&
      aLower.includes(b.text.toLowerCase()) &&
      b.text.length < a.text.length
  );
});
```

Also, add "MAIN RECIPE" to the filtered prefixes or metadata patterns so
"MAIN RECIPE: HERB ROASTED PORK WITH MUSHROOMS" doesn't enter the candidate pool
as a competitor. Pattern: `/^MAIN\s+RECIPE\s*:/i`.

Similarly, lines starting with `--` followed by a section label (like "--VARIATION:",
"--WERSJA") should be filtered as structural sub-headers.

#### Before / After

```
"HERB ROASTED PORK WITH MUSHROOMS : PORK WITH CARAMELIZED ONIONS (VARIATION)"
Before: dedup removes it in favor of shorter substring → falls to "--VARIATION: ..."
After:  compound title protected from dedup → returned as-is ✓

"PIERNIK TRADYCYJNY + PIERNIK NOWOCZESNY Z CZEKOLADĄ"
Before: dedup removes in favor of shorter substring → "--WERSJA NOWOCZESNA Z CZEKOLADĄ"
After:  compound title protected → returned as-is ✓
```

### Expected Impact

Fixes both Pattern 5 failures.

---

## Pattern 6: Polish title + English subtitle on line 2 (1 failure)

### Root Cause

"Golonka" (single word, mixed-case) at position 0, "Roasted Pork Knuckle" at position 1.
The extractor returns cooking instruction text from deep in the file.

The `pos0Primary` subtitle suppression logic (line 891) fires when position-0 candidate
has ≤5 words and is followed by a longer mixed-case candidate. But the penalty (-0.15)
is applied to the *subtitle*, not to help the title. The real problem is that "Golonka"
itself scores poorly on embeddings (single Polish food word vs. English reference
"recipe name, dish title") and falls below threshold.

The fallback logic (line 915-925) should catch this: when all candidates are below
threshold, it picks the earliest with rawScore > -0.05 for position ≤ 2. But "Golonka"
might not be the earliest candidate if it was somehow filtered or if "Roasted Pork Knuckle"
at position 1 has a better score.

Actually, looking more carefully: "Golonka" should pass all hard filters and become
position-0 candidate. The fallback should pick it. The fact that the extractor returns
"Scatter vegetables around pan. + Sauce: Remove knuckles..." suggests something deeper
is wrong — possibly "Scatter vegetables around pan." passes hard filters (it's a cooking
instruction but wordCount is only 4, and `looksLikeCookingInstruction` checks for ≥4 words
AND starts with cooking verb — "Scatter" is NOT in `COOKING_INSTRUCTION_STARTS`!).

**Secondary bug**: "Scatter" (and several other cooking verbs) are missing from
`COOKING_INSTRUCTION_STARTS`.

### Proposed Fix: Two changes

1. **Expand `COOKING_INSTRUCTION_STARTS`** to include missing verbs: "scatter", "score",
   "pat", "rub", "pour", "skim", "strain", "heat", "discard", "rest", "marinate", "wrap".

2. **Strengthen position-0 single-word title handling**: When position 0 has a single
   word that passed hard filters and position 1 has a plausible subtitle (2-5 words,
   mixed-case, not ingredients), treat position 0 as a high-confidence title candidate
   regardless of embedding score. This is a structural pattern: `[FoodName]\n[English Translation]\n\nIngredients:` is a standard bilingual recipe layout.

   Specifically: if the first candidate is at position 0 with 1-2 words, and position 1
   has a mixed-case line of 2-5 words that is NOT an ingredient or instruction, AND
   position 2+ starts with "Ingredients:" or similar section label, boost the position-0
   candidate by +0.15 (enough to clear any threshold).

#### Before / After

```
"Golonka" (pos 0) / "Roasted Pork Knuckle" (pos 1) / "Ingredients:" (pos 3)
Before: "Golonka" has weak embedding → falls below threshold → body text selected
After:  bilingual pattern detected → "Golonka" boosted → selected ✓
```

### Expected Impact

Fixes Pattern 6. The cooking-verb expansion also helps prevent future body-text leakage.

---

## Pattern 7: Heavy OCR corruption in body, clean title skipped (1 failure)

### Root Cause

"PLACKI ZIEMNIACZANE" is clean ALL_CAPS on line 1. The body is extremely corrupted with
Cyrillic characters, pipe symbols, and digit substitutions. The extractor returns
"Sp|aszcz paіką do grubość-ci około 1 centyme-tra." — a corrupted instruction line.

The title should be found: it's ALL_CAPS, 2 words, at position 0. The structural heading
logic should identify it. But the body corruption may produce false-positive candidates
that score higher, or the heavy corruption may confuse `findBurstEnd`.

Most likely: "PLACKI ZIEMNIACZANE" is correctly identified as a structural heading and
gets the +0.10 bonus. But "SKLADNIK1:" on line 3 looks like a section label after
OCR repair (SKŁADNIKI → section label). The instruction lines with Cyrillic text may
bypass `isLikelyGarbled` because they contain enough vowels in the Cyrillic portions.

Actually, the simplest explanation: "Sp|aszcz" passes hard filters because `|` is not
explicitly filtered (only `" | "` with spaces is filtered). And the mixed Cyrillic/Latin
text has enough vowels to pass the garbled check.

### Proposed Fix: Strengthen garbled-text detection

1. **Filter pipe characters in words**: A word containing `|` (pipe) within letter
   sequences is OCR noise. Add to `isLikelyGarbled`: if any word contains `|` between
   letters, mark as garbled.

2. **Filter mixed-script text**: If a line contains both Latin and Cyrillic characters,
   it's OCR corruption. Add: `if (/[а-яА-Я]/.test(text) && /[a-zA-Z]/.test(text)) return true;`

3. **With the pre-scoring OCR repair** (from Pattern 1/2 fix), "SKLADNIK1" becomes
   "SKŁADNIKI" → recognized as section label → filtered. This removes a false positive
   that may have been competing with the real title.

#### Before / After

```
"Sp|aszcz paіką do grubość-ci około 1 centyme-tra."
Before: passes isLikelyGarbled (enough vowels), passes passesHardFilters
After:  pipe-in-word check → garbled → filtered out

"PLACKI ZIEMNIACZANE" (line 1, clean ALL_CAPS)
Before: competes with corrupted body text → loses
After:  corrupted body text all filtered → wins easily ✓
```

### Expected Impact

Fixes Pattern 7. Also improves robustness on any future files with OCR mixing scripts.

---

## Summary of Changes

### New file: `lib/text-classifier/food-dictionary.ts`

A `Set<string>` of ~500 common English and Polish food/cooking words used for
dictionary-guided OCR repair. Words are stored lowercase, without diacritics (for
OCR-resilient matching).

### Modified file: `lib/text-classifier/title-extractor.ts`

| Change | Location | Patterns Fixed |
|--------|----------|----------------|
| Dictionary-guided OCR repair function | New function `repairOcrWord()` | 1, 2, 7 |
| Apply OCR repair before candidate scoring | `extractTitleWithEmbeddings`, before embed calls | 1, 2, 7 |
| Candidate-relative position bonus | `extractTitleWithEmbeddings`, position factor calc | 3 |
| First-after-preamble bonus | `extractTitleWithEmbeddings`, after buildCandidates | 3 |
| Title-absent page detection | `extractTitleWithEmbeddings`, early return | 4 |
| Protect compound titles from dedup | Dedup filter block | 5 |
| Filter "MAIN RECIPE:" prefix | `METADATA_PATTERNS` | 5 |
| Filter `--VARIATION:` sub-headers | `passesHardFilters` | 5 |
| Expand cooking verb list | `COOKING_INSTRUCTION_STARTS` | 6 |
| Bilingual layout pattern boost | `extractTitleWithEmbeddings`, new bonus | 6 |
| Pipe-in-word garbled detection | `isLikelyGarbled` | 7 |
| Mixed Cyrillic/Latin garbled detection | `isLikelyGarbled` | 7 |

### Expected accuracy impact

| Pattern | Count | Expected Fix Rate |
|---------|-------|-------------------|
| 1. OCR digits, partial correction | 4 | 4/4 (dictionary repair) |
| 2. OCR annotation confuses extractor | 5 | 5/5 (pre-scoring repair) |
| 3. Category header before title | 3 | 3/3 (candidate-relative position) |
| 4. Title absent from text | 2 | 2/2 (title-absent detection) |
| 5. Compound title truncated | 2 | 2/2 (dedup protection) |
| 6. Subtitle on line 2 | 1 | 1/1 (bilingual boost + verb expansion) |
| 7. Heavy body corruption | 1 | 1/1 (garbled detection + OCR repair) |
| **Total** | **18** | **18/18** |

### Risk Assessment

- **Dictionary-guided OCR repair** is the highest-risk change (new code path, could
  over-correct clean text). Mitigation: only trigger when word contains a known
  OCR-artifact character; dictionary match is a positive signal, not a filter.

- **Compound title dedup protection** could allow over-long titles to survive. Mitigation:
  only protects titles with explicit ` : ` or ` + ` separators, which are intentional
  compound forms.

- **Title-absent detection** could produce false negatives (return empty when title exists
  but is preceded by ingredient-like lines). Mitigation: only trigger when the *first 3*
  non-empty lines are all ingredients/instructions — rare for files that do have a title.

- **Candidate-relative position bonus** changes scoring for all files, not just the 3
  failures. Mitigation: the bonus is additive to existing position factor, not a replacement.
  Files where position-0 candidate is correct (the common case) are unaffected because
  their first candidate is also position-0 in the raw array.

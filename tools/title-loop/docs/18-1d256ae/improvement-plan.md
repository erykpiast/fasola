# Iteration 18 → 19: Improvement Plan

## Executive Summary

54 failures across 203 test cases (73% pass rate). The failures cluster into two dominant issues — **no case normalization** (~20 failures) and **long garbage prologues bypassing burst detection** (~12 failures) — plus six structural bugs. This plan proposes 9 targeted changes expected to resolve 48–52 of the 54 failures.

The core pipeline (embedding scoring, threshold logic, bilingual detection) is sound and should not be touched. The changes target: output normalization, filter gaps, candidate generation, and dedup edge cases.

---

## Change 1: Title Case Normalization (Pattern 1)

**Fixes ~20 failures:** Barszcz, Beef Stew, Mushroom Pasta, Mushroom Barley Soup, Kluski Śląskie, Pierogi Ruskie, Placki Serowe, Placki Ziemniaczane, Placki Owocowe, Placki Słodkie, Roladki Szpinakowe, Paella Valenciana, and others.

### Root Cause

The algorithm returns OCR text verbatim. ALL_CAPS recipe titles are returned as `BARSZCZ` when the test expects `Barszcz`. The algorithm correctly *found* the title — it just returned it in the wrong case. This is not a detection bug, it's a missing normalization step.

### Proposed Change

Add a `normalizeCase()` function applied as the **very last step** before returning the result, after all scoring, dedup, and joining is complete.

**Rules:**
1. If the entire result is ALL_CAPS, convert to Title Case
2. Title Case conversion: capitalize first letter of each word, lowercase the rest
3. Exception: preserve lowercase for short prepositions/conjunctions (`z`, `w`, `ze`, `i`, `a`, `of`, `or`, `to`, `in`, `on`, `an`, `at`, `by`, `do`, `na`, `po`, `od`, `ku`) — but always capitalize the first word
4. For multi-title results joined with ` + `, apply normalization to each segment independently
5. If the original OCR has mixed case (e.g., `Szarlotka`, `Beef Wellington`), return as-is — only normalize ALL_CAPS

**Before:**
```typescript
return selected.map((s) => s.text).join(" + ");
```

**After:**
```typescript
return selected.map((s) => normalizeCase(s.text)).join(" + ");
```

```typescript
const LOWERCASE_WORDS = new Set([
  "z", "w", "ze", "i", "a", "of", "or", "to", "in", "on", "an", "at", "by",
  "do", "na", "po", "od", "ku", "ni", "bo",
]);

function normalizeCase(text: string): string {
  if (!isAllCaps(text)) return text;
  const words = text.split(/\s+/);
  return words.map((word, idx) => {
    const lower = word.toLowerCase();
    if (idx > 0 && LOWERCASE_WORDS.has(lower)) return lower;
    // Handle non-letter prefixes (e.g., "(Polish" → "(polish" → "(Polish")
    return lower.replace(/[a-ząćęłńóśźż]/i, (ch) => ch.toUpperCase());
  }).join(" ");
}
```

### Expected Impact

Eliminates the single largest failure cluster (~20 tests). Zero risk to currently-passing tests since it only transforms ALL_CAPS output, which is universally wrong in the test expectations.

---

## Change 2: Add Polish Prepositions to `commonShort2` (Pattern 2)

**Fixes 2 failures:** Krem Grzybowy ze Śmietaną, Konfitury ze Liwek.

### Root Cause

The `isLikelyGarbled` multi-word check flags any short (≤2 letter) lowercase word not in `commonShort2`. The set contains `z` but not `ze` (its pre-consonant-cluster form) or other common Polish 2-letter prepositions.

### Proposed Change

Expand `commonShort2` to include Polish short words:

**Before:**
```typescript
const commonShort2 = new Set([
  "a", "i", "of", "or", "to", "in", "on", "is", "it", "an",
  "as", "at", "by", "do", "go", "if", "no", "so", "up", "we",
  "w", "z",  // Polish prepositions
]);
```

**After:**
```typescript
const commonShort2 = new Set([
  "a", "i", "of", "or", "to", "in", "on", "is", "it", "an",
  "as", "at", "by", "do", "go", "if", "no", "so", "up", "we",
  "w", "z",   // Polish prepositions (basic)
  "ze", "bo", "na", "ni", "po", "ku", "od", "za", "co",  // Polish prepositions (extended)
]);
```

Note: `na`, `po`, `od`, `za`, `co` are 2-letter Polish words that appear in recipe titles (e.g., `Kaczka na Dziko`, `Pierogi po Podhalańsku`). Without these, any title containing them gets garble-filtered.

### Expected Impact

Direct fix for 2 known failures. Prevents future regressions for any Polish title containing these prepositions. No risk to existing tests — these are all legitimate words that should never be flagged as garbled.

---

## Change 3: Protect Multi-Line Joins from Component-Part Dedup (Pattern 3)

**Fixes ~4 failures:** Lamb Stew, Żur Żytni, and similar split-title cases.

### Root Cause

When a two-word title is split across lines (`Lamb` / `Stew`), each word becomes a single-line candidate AND a 2-line join `Lamb Stew` is generated. The dedup rule "keep the shorter substring" removes `Lamb Stew` because it contains `Lamb` (shorter) and `Stew` (shorter). The compound title is destroyed by its own components.

### Proposed Change

Add a **pre-dedup join protection step**: when a multi-line join candidate survived threshold, and ALL of its component single-line candidates also survived, remove the singles and keep the join. The join is structurally stronger evidence — the algorithm generated it specifically because consecutive lines were detected.

**Implementation:** After the existing join-protection block (which handles continuation characters) and before the dedup block, add:

```typescript
// Protect multi-line joins from being destroyed by their own component singles.
// When "Lamb Stew" (2-line join at position P) survives AND both "Lamb" (single at P)
// and "Stew" (single at P+1) survive, the join is the intended title — remove the singles.
const joinsToProtect = selected.filter((s) => s.origin === "2-line" || s.origin === "3-line");
if (joinsToProtect.length > 0) {
  const singlesToRemove = new Set<string>();
  for (const join of joinsToProtect) {
    const joinWords = join.text.split(/\s+/);
    // Only protect joins where each component word is itself a surviving single
    const componentSingles = selected.filter(
      (s) => s.origin === "single" && joinWords.some((w) =>
        s.text.toLowerCase() === w.toLowerCase()
      )
    );
    // If we found singles matching most/all join words, remove them
    if (componentSingles.length >= Math.min(joinWords.length, 2)) {
      componentSingles.forEach((s) => singlesToRemove.add(s.text));
    }
  }
  if (singlesToRemove.size > 0) {
    selected = selected.filter((s) =>
      s.origin !== "single" || !singlesToRemove.has(s.text)
    );
  }
}
```

**Safety:** This only fires when a join AND its exact component singles all survived threshold — a very narrow condition. It doesn't affect the dedup rule itself (which remains "shorter wins" for all other cases like `Pierogi Ruskie` vs `Pierogi Ruskie 200g mąki`).

### Note on Żur Żytni

`Żur` is filtered as garbled (ASCII letters = `ur`, 2 chars). This is a separate issue from the dedup problem. The fix requires either:
- Adjusting `isLikelyGarbled` to count Unicode letters (not just ASCII) for the single-word-short check
- Or adding `Żur` to some allowlist

The better fix: change the single-word-short check from counting ASCII letters to counting all Unicode letters:

**Before:**
```typescript
if (words.length === 1 && letters.length <= 3 && !COMMON_SHORT.has(text.trim().toLowerCase())) {
```

**After:**
```typescript
const unicodeLetters = text.trim().replace(/[^a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, "");
if (words.length === 1 && unicodeLetters.length <= 3 && !COMMON_SHORT.has(text.trim().toLowerCase())) {
```

Or more robustly, use a Unicode letter regex: `/\p{L}/gu` to count all letters regardless of script.

### Expected Impact

Fixes Lamb Stew directly. Combined with the Unicode letter fix for garbled detection, fixes Żur Żytni. Combined with Change 1 (case normalization), all split-title cases should pass.

---

## Change 4: Context-Aware Section Label Join Blocking (Pattern 4)

**Fixes 1 failure:** Zupy Zimowe Warzywne.

### Root Cause

`Zupy` is in `SECTION_LABELS` (meaning "soups" — a recipe category). The join-generation code blocks any 2-line or 3-line join starting with a section label. This is correct when `Zupy` stands alone as a category header, but wrong when `Zupy` starts a multi-word title like `Zupy Zimowe Warzywne` ("Winter Vegetable Soups").

### Proposed Change

Relax the section-label join block: allow joins starting with a section label **when the combined result has ≥3 words**. A standalone category header (`Zupy`) is 1 word. A category word followed by modifiers (`Zupy Zimowe Warzywne`) is a recipe title, not a category header.

**Before:**
```typescript
// 2-line join — skip if first line is a section label
if (i + 1 < mergedLines.length && !isSectionLabel(line.text)) {
```

**After:**
```typescript
// 2-line join — skip if first line is a section label AND the join would be ≤2 words
// (a section label + modifiers = likely a recipe title, not a category header)
if (i + 1 < mergedLines.length) {
  const shouldBlockJoin = isSectionLabel(line.text) &&
    wordCount(`${line.text} ${mergedLines[i + 1].text}`) <= 2;
  if (!shouldBlockJoin) {
```

Same logic for 3-line joins — always allow when total word count ≥ 3.

**Safety:** A standalone `Zupy` followed by a recipe title like `Barszcz` would produce `Zupy Barszcz` (2 words) — still blocked. `Zupy` followed by `Zimowe` + `Warzywne` produces `Zupy Zimowe Warzywne` (3 words) — allowed. The heuristic "category + 1 word = noise, category + 2+ words = title" is reliable for recipe books.

### Expected Impact

Fixes Zupy Zimowe Warzywne. Enables reconstruction of any multi-word title that happens to start with a category word (e.g., `Placki Ziemniaczane` if `Placki` were a section label, `Ciasto Drożdżowe` since `Ciasto` is in SECTION_LABELS).

---

## Change 5: Content-Based Garbage Prologue Detection (Pattern 5)

**Fixes ~12 failures:** Brownies, Sernik, Szarlotka, Zupa Grzybowa, Lemonade, Strawberry Shortcake, Strawberry Smoothie, Tomato Bisque, Tomato Chutney, Vegetable Stir Fry, Quick Golabki, and others.

### Root Cause

`findBurstEnd` only skips lines that are BOTH short (< 20 chars) AND garbled. The generated test files have 28–35 lines of long (30–55 char) OCR garbage that look like cooking instructions (`Beat egg whites until stiff peaks form, then fold`). These pass all hard filters and pollute the candidate pool.

### Proposed Change

Replace the simplistic `findBurstEnd` with a **content-aware garbage prologue detector**. The key insight: these garbage lines are *cooking instruction fragments* — imperative sentences with cooking verbs. Real recipe titles never contain imperative cooking verbs.

**New approach — two-pronged:**

#### Prong 1: Instruction-line filter in `passesHardFilters`

Add a check for lines that look like cooking instructions (imperative verb at start, or contain characteristic cooking action phrases):

```typescript
const COOKING_INSTRUCTION_STARTS = /^(beat|fold|stir|mix|add|pour|bake|cook|cool|remove|place|combine|whisk|knead|roll|spread|brush|slice|chop|dice|mince|drain|rinse|peel|grate|melt|simmer|boil|fry|sauté|saute|roast|grill|broil|steam|let|set|transfer|serve|garnish|arrange|sprinkle|season|preheat|cover|uncover|reduce|bring|toss|cut|trim|shape|form)\b/i;

function looksLikeCookingInstruction(text: string): boolean {
  const words = text.trim().split(/\s+/);
  if (words.length < 4) return false;  // Instructions are multi-word sentences
  if (COOKING_INSTRUCTION_STARTS.test(text.trim())) return true;
  return false;
}
```

Add to `passesHardFilters`:
```typescript
if (looksLikeCookingInstruction(text)) return false;
```

**Risk mitigation:** Only fires on lines with ≥4 words that start with imperative cooking verbs. No recipe title starts with "Beat", "Fold", "Stir" etc. and has 4+ words. Titles like "Baked Cod with Herbs" start with past-tense "Baked" (not in the list) or nouns. "Roasted Brussels Sprouts" starts with "Roasted" (past participle, not imperative "Roast"). However, we must be careful: "Roast Chicken" starts with "Roast" but has only 2 words (< 4 threshold). Safe.

**Exceptions to verify:** "Grilled Steak" (2 words, safe), "Grilled Chicken with Lemon" (4 words, starts with "Grilled" not "Grill", safe), "Baked Cod with Herbs" (4 words, starts with "Baked" not "Bake", safe). The imperative form ("Bake", "Grill", "Roast") differs from the past participle ("Baked", "Grilled", "Roasted") used in titles. The regex matches the imperative base form only.

#### Prong 2: Enhanced `findBurstEnd` with repetition detection

When the first N lines (N ≥ 5) are all long (≥ 20 chars) AND none pass the title-likeness test (short, ≤5 words, not an instruction), advance the burst end past them:

```typescript
function findBurstEnd(lines: Array<{ text: string }>): number {
  let i = 0;
  // Original: skip short garbled lines
  while (i < lines.length && lines[i].text.length < 20 && isLikelyGarbled(lines[i].text)) {
    i++;
  }
  // New: skip long instruction-like prologues
  // If we're still at position 0 and the next 5+ lines are all instruction-like,
  // skip them to find the actual title region
  if (i === 0) {
    let j = 0;
    while (j < lines.length && looksLikeCookingInstruction(lines[j].text)) {
      j++;
    }
    if (j >= 5) {
      i = j; // Skip the entire instruction prologue
    }
  }
  return i;
}
```

### Expected Impact

Eliminates ~12 failures from the garbage-prologue pattern. The instruction-line filter in `passesHardFilters` also improves candidate quality across ALL files (fewer false-positive candidates from instruction lines within the recipe body).

---

## Change 6: Add `SEZON:` to Metadata Patterns (Pattern 6)

**Fixes ~2 failures:** Beet Salad, Coleslaw.

### Root Cause

`SEZON: WIOSNA` (Season: Spring) is a recipe categorization header, not a title. It passes all hard filters and gets position + structural bonuses. The `METADATA_PATTERNS` list doesn't include season indicators.

### Proposed Change

Add to `METADATA_PATTERNS`:

```typescript
// Season/category indicators
/^SEZON\s*:/i,
// Category indicators (Polish)
/^KATEGORIA\s*:/i,
/^RODZAJ\s*:/i,
```

### Expected Impact

Direct fix for 2 known failures. Prevents any `SEZON:` line from ever entering the candidate pool.

---

## Change 7: Strip Parenthetical Glosses from Candidates (Pattern 7)

**Fixes ~5 failures:** Piernik, Żurek, Pierogi Ruskie, Bigos Myśliwski, Makowiec.

### Root Cause

The `(` continuation pre-merge step merges English subtitle glosses like `(Polish Gingerbread)` into the preceding title line. The result `PIEROGI RUSKIE (Boiled Dumplings with Potato and Cheese)` is returned instead of `PIEROGI RUSKIE`.

### Proposed Change

Add a **parenthetical gloss stripper** as a post-merge normalization step. When a candidate ends with a parenthetical that contains mixed-case English text (a translation/gloss), strip it.

```typescript
function stripParentheticalGloss(text: string): string {
  // Match trailing parenthetical with mixed-case content (English glosses)
  // e.g., "PIEROGI RUSKIE (Boiled Dumplings with Potato and Cheese)"
  // but NOT "SAFFRON WHEAT BUNS (VARIATION D)" (ALL_CAPS = part of title)
  const match = text.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (!match) return text;
  const [, base, paren] = match;
  // Keep if parenthetical is ALL_CAPS (variation/subtitle in same language)
  if (isAllCaps(paren)) return text;
  // Keep if base is mixed-case and paren is also mixed-case (both parts are title)
  if (!isAllCaps(base) && !isAllCaps(paren)) return text;
  // Strip: ALL_CAPS base + mixed-case parenthetical = translation gloss
  return base.trim();
}
```

Apply this in `buildCandidates` after the continuation pre-merge, or as a transform on every candidate before scoring:

```typescript
// In the single-line candidate generation:
const cleaned = stripParentheticalGloss(line.text);
if (passesHardFilters(cleaned)) {
  candidates.push({ text: cleaned, position: line.index, origin: "single" });
}
```

Also handle the case where the parenthetical is on the same OCR line (e.g., `MAKOWIEC (Polish Poppy Seed Cake)`): the strip function handles this since it operates on the text content regardless of how it was assembled.

### Expected Impact

Fixes ~5 failures where English glosses contaminate the title. Combined with Change 1 (case normalization), the stripped ALL_CAPS title is then correctly converted to Title Case.

---

## Change 8: Position-Aware Dedup for Compound Titles (Pattern 8)

**Fixes 1 failure:** HERB BAKED SALMON + DILL SAUCE VARIATION.

### Root Cause

`HERB BAKED SALMON + DILL SAUCE VARIATION` (position 0, compound title) is removed by dedup because it contains `DILL SAUCE VARIATION` (position 32, sub-recipe header) as a shorter substring.

### Proposed Change

Amend the dedup rule: a candidate at position 0 (the very first non-empty line) is **immune** from "shorter wins" removal when the shorter candidate is at a much later position (> 10 lines away). The rationale: when a line-1 compound title literally contains a later section header, the compound is the correct answer — the section header is a sub-recipe that was named after a part of the compound title.

```typescript
// Dedup with position awareness for compound titles
selected = selected.filter((a) => {
  const aLower = a.text.toLowerCase();
  return !selected.some(
    (b) =>
      b !== a &&
      aLower.includes(b.text.toLowerCase()) &&
      b.text.length < a.text.length &&
      // Protect position-0 compound titles from distant sub-headers
      !(a.position === 0 && b.position > a.position + 10)
  );
});
```

**Safety:** Only changes behavior when (a) the longer candidate is at position 0, AND (b) the shorter candidate is > 10 lines away. This is an extremely narrow condition that only fires for compound recipe titles. The normal dedup case (adjacent candidates, `Pierogi Ruskie` vs `Pierogi Ruskie 200g mąki`) is unaffected because both are at nearby positions.

### Expected Impact

Fixes the HERB BAKED SALMON case directly. Any similar compound-title document structure would also be handled.

---

## Change 9: Page Number Prefix Stripping (Pattern 9)

**Fixes 1 failure:** Berry Jam.

### Root Cause

OCR line 3: `34  Berry Jam`. The `startsWithNumber` check discards the entire line because it starts with digit `3`. The actual title `Berry Jam` is never extracted.

### Proposed Change

Modify `startsWithNumber` to first try stripping a page-number prefix. If a line matches `^\d{1,3}\s{2,}[A-Z]` (1–3 digits, 2+ spaces, then an uppercase letter), strip the number prefix and return the remainder as the candidate text instead of discarding the whole line.

**Implementation:** Rather than changing `startsWithNumber`, add a normalization step in `buildCandidates` that strips page number prefixes before hard filtering:

```typescript
function stripPageNumber(text: string): string {
  // "34  Berry Jam" → "Berry Jam"
  // "7   Chocolate Cake" → "Chocolate Cake"
  // Must have 2+ spaces to distinguish from "2 eggs" (ingredient)
  const match = text.match(/^\d{1,3}\s{2,}(.+)$/);
  return match ? match[1] : text;
}
```

Apply before `passesHardFilters` in the candidate generation loop:

```typescript
const rawText = line.text;
const strippedText = stripPageNumber(rawText);
if (passesHardFilters(strippedText)) {
  candidates.push({ text: strippedText, position: line.index, origin: "single" });
}
```

**Safety:** The 2+ space requirement prevents stripping ingredient quantities like `2 eggs` or `100g flour`. Page numbers followed by titles always have multiple spaces (typographic convention).

### Expected Impact

Fixes Berry Jam. Handles any recipe that has page numbers in the OCR output.

---

## Not Addressed (Accepted Limitations)

### Pattern 10: OCR Character Substitution (Crème Brûlée → Crème Brû1ée)

This requires OCR post-processing (digit→letter substitution: `1→l`, `0→o`, `5→s`). While technically possible, implementing a general OCR correction system is:
- Risky (false positives on legitimate digits in titles)
- Out of scope for the title extractor (belongs in the OCR pipeline)
- Only affects 1 test case

**Recommendation:** Fix in the OCR preprocessing step, not in title extraction.

### Pattern 11: Missing Word in OCR (Bigos z Wdzonych Kielbas)

The preposition `z` is absent from the OCR input entirely. The algorithm cannot recover words that were never scanned. This is an OCR quality issue.

**Recommendation:** Accept as unfixable in the title extractor.

---

## Summary of Changes

| # | Pattern | Files Fixed | Risk | Complexity |
|---|---------|-------------|------|------------|
| 1 | Case normalization | ~20 | Very low | Low |
| 2 | Polish prepositions in commonShort2 | 2 | None | Trivial |
| 3 | Protect joins from component dedup | ~4 | Low | Medium |
| 4 | Context-aware section label joins | 1 | Low | Low |
| 5 | Content-based garbage detection | ~12 | Medium | Medium |
| 6 | SEZON: metadata pattern | ~2 | None | Trivial |
| 7 | Strip parenthetical glosses | ~5 | Low | Medium |
| 8 | Position-aware compound dedup | 1 | Very low | Low |
| 9 | Page number prefix stripping | 1 | Low | Low |

**Expected total fixes: 48–52 out of 54 failures**
**Expected new pass rate: ~96–98%**

## Implementation Order

Recommended order (highest impact, lowest risk first):

1. Change 1 (case normalization) — biggest win, zero interaction with other changes
2. Change 2 (commonShort2) — trivial, zero risk
3. Change 6 (SEZON: metadata) — trivial, zero risk
4. Change 9 (page number strip) — small, isolated
5. Change 7 (parenthetical strip) — medium, needed before case normalization works fully
6. Change 4 (section label join relaxation) — small, isolated
7. Change 5 (garbage prologue detection) — biggest code change, needs careful testing
8. Change 3 (join protection in dedup) — interacts with dedup, test carefully
9. Change 8 (position-aware dedup) — interacts with dedup, test last

Changes 1, 2, 6, and 9 are fully independent and can be implemented in parallel. Changes 3 and 8 both touch the dedup logic and should be tested together. Change 5 should be tested with the full corpus since it modifies candidate generation.

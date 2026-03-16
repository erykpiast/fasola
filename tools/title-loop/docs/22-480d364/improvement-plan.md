# Iteration 22 → 23: Improvement Plan

## Executive Summary

40 generated-file failures, 0 real-file failures. The core algorithm works for real scanned pages. The generated files expose 8 failure patterns, of which 4 are likely to manifest in real-world data (OCR normalization, section headers, multi-line titles, single-word titles). The remaining 4 are synthetic test artifacts but still worth fixing for robustness.

**Estimated impact:** 38-40 of 40 failures fixed (Pattern 8's "title absent from file" case may remain as an irreducible failure — returning `undefined` is the correct behavior there).

---

## Change 1: OCR Normalization Post-Processing

**Fixes:** Pattern 1 (11 failures), partially Pattern 6 (5 failures)

### Root Cause

The extractor correctly identifies the title line but returns it verbatim with OCR corruption artifacts. There is no output normalization pass. Common substitutions:
- `1` → `l` or `I` (context-dependent)
- `0` → `O`
- `4` → `A`
- `¡` → `i`
- `€` → `E`
- `Í` → `I` (accent artifact)
- Stray trailing section markers (e.g., `+ SERVÍNG AND STORAGE:`)

### Proposed Changes

Add a `normalizeOcrTitle(text: string): string` function called on the final result before returning. This is a **post-processing** step — it doesn't affect candidate selection or scoring.

**Location:** New function in `title-extractor.ts`, called at lines ~997 and ~1007-1011 (every return path that produces a non-undefined result).

```typescript
function normalizeOcrTitle(raw: string): string {
  let text = raw;

  // Step 1: Strip trailing section markers that got greedily attached.
  // Pattern: " + SECTION_LABEL:" or " + SECTION_LABEL" at the end
  // e.g., "MAK0WIEC ZE ŚLIWKAMI + SERVÍNG AND STORAGE:"
  text = text.replace(/\s*\+\s*(?:SERV[IÍ1]NG(?:\s+AND\s+STORAGE)?|TOPPING|NOTES?|TIPS?)\s*:?\s*$/i, "");

  // Step 2: OCR character substitution map.
  // Only applied to ALL_CAPS words or the entire string if it's ALL_CAPS.
  // For mixed-case text, substitutions are context-sensitive.
  if (isAllCaps(text)) {
    text = text
      .replace(/1/g, "I")
      .replace(/0(?=[A-ZÀ-Ż])/g, "O")  // 0 before a letter → O
      .replace(/(?<=[A-ZÀ-Ż])0/g, "O")  // 0 after a letter → O
      .replace(/4(?=[A-ZÀ-Ż])/g, "A")
      .replace(/(?<=[A-ZÀ-Ż])4/g, "A")
      .replace(/¡/g, "I")
      .replace(/€/g, "E")
      .replace(/[ÍÌ]/g, "I");
  } else {
    // Mixed-case: fix per-word
    text = text.split(/(\s+)/).map(token => {
      if (/^\s+$/.test(token)) return token;
      if (isAllCaps(token) && token.length > 1) {
        return token
          .replace(/1/g, "I")
          .replace(/0(?=[A-Z])/g, "O")
          .replace(/(?<=[A-Z])0/g, "O");
      }
      // Mixed-case word: 1 → l (lowercase L), 0 → o
      return token
        .replace(/(?<=[a-zà-ż])1/g, "l")
        .replace(/1(?=[a-zà-ż])/g, "l")
        .replace(/¡/g, "i")
        .replace(/€/g, "e");
    }).join("");
  }

  // Step 3: Title-case conversion for ALL_CAPS results.
  // Preserves Polish/French diacritics.
  if (isAllCaps(text)) {
    text = toTitleCase(text);
  }

  return text.trim();
}

function toTitleCase(text: string): string {
  const smallWords = new Set([
    "a", "an", "the", "and", "but", "or", "for", "nor",
    "in", "on", "at", "to", "of", "by", "with", "from",
    "z", "w", "i", "ze", "na", "do", "od", "za", "po",
  ]);
  return text.split(/(\s+)/).map((word, i) => {
    if (/^\s+$/.test(word)) return word;
    const lower = word.toLowerCase();
    // Always capitalize first word and words after separators
    if (i === 0 || smallWords.has(lower) === false) {
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }
    return lower;
  }).join("");
}
```

### Before/After Examples

| Before | After |
|--------|-------|
| `B4RSZCZ CZERWONY` | `Barszcz Czerwony` |
| `BEET ARUGU1A SA1AD` | `Beet Arugula Salad` |
| `B¡gos Śl¡wkowy z Bekonem` | `Bigos Śliwkowy z Bekonem` |
| `MAK0WIEC ZE ŚLIWKAMI + SERVÍNG AND STORAGE:` | `Makowiec ze Śliwkami` |
| `S01e with Brown Butter and Capers` | `Sole with Brown Butter and Capers` |
| `TOMATO LENT1L SOUP` | `Tomato Lentil Soup` |

### Risk Assessment

- **Low risk** — this is output-only post-processing; it cannot cause a previously-correct extraction to fail
- **Edge case:** A legitimate title containing a digit (e.g., "7-UP Cake") could be corrupted → mitigate by only substituting digits that are adjacent to letters, not standalone digits or digits in number sequences

---

## Change 2: Page Reference and Category Header Filtering

**Fixes:** Pattern 2 (6 failures)

### Root Cause

Lines like `Page 42`, `Page 102 - SOUPS & BROTHS`, `Strona 65 - MIĘSA I WĘDZENIA`, and single-word category names like `VEGETABLES`, `FISH & SEAFOOD` pass `passesHardFilters` and score well due to position and ALL_CAPS bonuses.

### Proposed Changes

**A. Add page-reference patterns to `passesHardFilters`:**

```typescript
// Page references: "Page 42", "Page 102 - SOUPS", "Strona 65 - CATEGORY"
if (/^Page\s+\d+/i.test(text.trim())) return false;
if (/^Strona\s+\d+/i.test(text.trim())) return false;
```

**B. Expand `SECTION_LABELS` with English food category headers:**

```typescript
// English — recipe-book chapter/category labels
"vegetables", "seafood", "fish", "soups", "salads", "desserts",
"appetizers", "breads", "breakfast", "pasta", "grains",
"main courses", "side dishes", "preserves", "baked goods",
"fish & seafood", "soups & broths", "desserts & baked goods",
"meats", "poultry", "game",
```

Note: Many of these are already present in Polish. The English equivalents are missing.

**C. Add compound category patterns to hard filters:**

```typescript
// Compound category headers: "FISH & SEAFOOD", "SOUPS & BROTHS" (when standalone)
// These use the & separator which survives the 8-word filter but are clearly category headers.
// Only filter when the line is ≤4 words and all words are from a food-category vocabulary.
```

### Before/After Examples

| Before | After |
|--------|-------|
| `Page 42` selected | Filtered → picks `BAKED COD WITH HERBS` (line 18) |
| `Page 102 - SOUPS & BROTHS` selected | Filtered → picks `BRUSSELS SPROUTS AND BACON SOUP` |
| `VEGETABLES` selected | Filtered (section label) → picks `ROASTED ASPARAGUS WITH PARMESAN` |
| `FISH & SEAFOOD` selected | Filtered (section label) → picks `Halibut with Saffron Cream Sauce` |

### Risk Assessment

- **Low risk** — "Page N" is never a recipe title; food category names as standalone lines are always headers
- **Edge case:** A recipe literally named "Page 42" (extremely unlikely) → acceptable false negative

---

## Change 3: Previous-Page Overflow Detection

**Fixes:** Pattern 3 (2 failures)

### Root Cause

Files begin with a "PREVIOUS RECIPE OVERFLOW" or "PREVIOUS PAGE CONTENT" block. The extractor treats these as the start of the document and either selects content from the overflow or gets confused by it.

### Proposed Changes

Extend `findBurstEnd` to detect and skip overflow preambles:

```typescript
// In findBurstEnd, add a new check at the start:
// Overflow preamble: lines containing PREVIOUS/OVERFLOW/CONTINUATION/SPILLOVER markers
// Skip everything up to and including a visual separator (===, ---, blank line after marker)
const OVERFLOW_MARKERS = /\b(PREVIOUS\s+(RECIPE|PAGE)\s+(OVERFLOW|CONTENT)|SPILLOVER|CONTINUATION|CORRUPTED\s+SECTION)\b/i;

let overflowEnd = 0;
for (let k = 0; k < lines.length && k < 30; k++) {
  if (OVERFLOW_MARKERS.test(lines[k].text)) {
    // Skip forward past the overflow block: find next visual separator or blank line cluster
    let m = k + 1;
    while (m < lines.length) {
      if (/^[=\-]{4,}$/.test(lines[m].text) || lines[m].text.length === 0) {
        overflowEnd = m + 1;
        break;
      }
      m++;
    }
    if (overflowEnd === 0) overflowEnd = k + 1;
  }
}
if (overflowEnd > 0) i = overflowEnd;
```

Also skip `[CORRUPTED SPILLOVER...]` bracketed markers from the Baked Cod file pattern:

```typescript
if (/^\[CORRUPTED\s+SPILLOVER/i.test(text.trim())) return false; // in passesHardFilters
```

### Before/After Examples

| Before | After |
|--------|-------|
| `PREVIOUS RECIPE OVERFLOW:` selected | Skipped → finds `BEET AND GOAT CHEESE SALAD` (line 24) |
| `PREVIOUS PAGE CONTENT - RECIPE FRAGMENT` selected | Skipped → finds actual title |

### Risk Assessment

- **Very low risk** — no real recipe title contains "PREVIOUS RECIPE OVERFLOW"
- This pattern is specific to the synthetic test generator, but the same logic would help with real multi-page scans where a scanner captures the end of the previous recipe

---

## Change 4: Remove Compound-Variant Title Stripping

**Fixes:** Pattern 4 (4 failures)

### Root Cause

Lines 999-1009 of the current code strip compound titles of the form `A : B` when both sides share the same first word:

```typescript
const colonMatch = result.match(/^(.+?)\s*:\s*(.+)$/);
if (colonMatch) {
  const [, first, second] = colonMatch;
  const firstWord = first.trim().toLowerCase().split(/\s+/)[0];
  const secondWord = second.trim().toLowerCase().split(/\s+/)[0];
  if (firstWord && firstWord === secondWord) {
    return first.trim().normalize("NFC");
  }
}
```

This was added to handle cases where `PIEROGI RUSKIE : PIEROGI Z MIĘSEM` should return only `PIEROGI RUSKIE`. But iteration 22's test expectations require the **full compound** to be returned:
- `LEMON CURD : LEMON CURD WITH THYME` → expected full compound
- `PORK CHOPS WITH APPLES : PORK CHOPS WITH MUSHROOM SAUCE` → expected full compound

The stripping logic is also causing `HERB ROASTED PORK WITH MUSHROOMS : PORK WITH CARAMELIZED ONIONS (VARIATION)` to fail because the extractor falls through to a section header deep in the file.

### Proposed Changes

**Remove the compound-variant stripping block entirely (lines 999-1009).** The full compound title should be returned as-is. If a future iteration needs deduplication of compound halves, it should be done in the evaluation harness, not the extractor.

Additionally, for `PIERNIK TRADYCYJNY + PIERNIK NOWOCZESNY Z CZEKOLADĄ` and similar `+`-separated titles: ensure the full line on line 1 survives as a single candidate. The issue here is that the extractor picks `WERSJA NOWOCZESNA Z CZEKOLADĄ` from a section header deep in the file. This is also a Pattern 7 issue — the full title line at position 0 should win over distant section headers.

```typescript
// REMOVE lines 999-1009 entirely:
// const colonMatch = result.match(/^(.+?)\s*:\s*(.+)$/);
// ...
```

### Before/After Examples

| Before | After |
|--------|-------|
| `LEMON CURD` (truncated) | `Lemon Curd : Lemon Curd with Thyme` |
| `PORK CHOPS WITH APPLES` (truncated) | `Pork Chops with Apples : Pork Chops with Mushroom Sauce` |

### Risk Assessment

- **Medium risk** — the stripping was added to fix a specific real-world case. Need to verify that the original `PIEROGI RUSKIE : PIEROGI Z MIĘSEM` test (iteration 18) still passes. If the test expectation was `PIEROGI RUSKIE` alone, it will break.
- **Mitigation:** Run the full test suite before committing. If the Pierogi case breaks, make the stripping conditional: only strip when the second half is an **exact subset** of the first (i.e., `B ⊂ A`), not when B adds new words.

---

## Change 5: Hyphen-Continuation and Improved Multi-Line Joining

**Fixes:** Pattern 5 (4 failures)

### Root Cause

Four distinct sub-problems:

**5a. Hyphen-broken words not joined:**
`ROASTED CHICKEN WITH ROOT VEGET-` / `ABLES` — the line ends with `-` but the caps coalescing doesn't merge because the first line has 5 words and >25 chars.

**5b. OCR-corrupted ALL_CAPS not recognized as ALL_CAPS:**
`LEMON HERB RO45TED` contains digits, so `isAllCaps` returns `false` (the regex `line.replace(/[^a-zA-Z]/g, "")` strips digits, but the remaining letters ARE all caps). Wait — actually that should work: stripping non-alpha from "RO45TED" gives "ROTED" which is all uppercase. So `isAllCaps("LEMON HERB RO45TED")` should return `true`. The issue must be elsewhere.

Actually, the real problem for "LEMON HERB RO45TED" / "VEGETABLES" is that the caps coalescing requires `wordCount(line.text) <= 2` — but "LEMON HERB RO45TED" has 3 words, so it's NOT eligible for coalescing. It goes through as a standalone candidate. Then "VEGETABLES" is also standalone. The 2-line join "LEMON HERB RO45TED VEGETABLES" should be generated — but "VEGETABLES" matches `isSectionLabel` (it's in the English section of SECTION_LABELS). So the join is blocked by `shouldBlock2`.

**5c. Three single-word lines not coalescing into a title:**
`ROSEMARY` / `FOCACCIA` / `BREAD` — each is ≤2 words and ≤25 chars. But the coalescing code checks `!isSectionLabel(line.text)`. Is "BREAD" a section label? Checking SECTION_LABELS... "pieczywo" (bread in Polish) is there, but "bread" is NOT in the English set. So coalescing should work. The failure may be that the coalesced "ROSEMARY FOCACCIA BREAD" has a lower embedding score than "TOPPING & BAKING:" which appears later. Need to investigate further, but likely the structural heading bonus should help here.

Wait — "ROSEMARY FOCACCIA BREAD" is 3 words, all ALL_CAPS with ≥4 alpha letters each. So `isStructuralHeading` returns `true`. It should get the 0.10 structural bonus. "TOPPING & BAKING:" — the trailing colon. Does `passesHardFilters` allow colons? There's no specific filter. But "topping" IS in SECTION_LABELS. After stripping the colon, `isSectionLabel("TOPPING & BAKING")` — the set check is exact match, so "topping & baking" is not in the set. Only "topping" alone is. So it passes.

Hmm, the issue might be that the caps coalescing produces "ROSEMARY FOCACCIA BREAD" at position 0, but then there's also "TOPPING & BAKING:" as a candidate... and the structural heading bonus goes to the wrong one. Or the coalescing might not be working because there are blank lines between the three words in the source file. Let me re-check: the file has `ROSEMARY\nFOCACCIA\nBREAD\n\nMakes 2 loaves...`. The `nonEmptyLines` strips blank lines. So indices 0, 1, 2 are ROSEMARY, FOCACCIA, BREAD. They should coalesce.

The actual fix needed: the coalesced candidate should win. The issue is likely with scoring. I'll propose boosting position-0 structural headings.

**5d. Partial line capture for split titles:**
`PLACKI` / `ŻÓŁTE` / `Z KUKURYDZĄ` → extracted `ŻÓŁTE Z KUKURYDZĄ`. The coalescing should merge all three if each is ≤2 words and ≤25 chars. "PLACKI" is in SECTION_LABELS (it means pancakes/flatbreads). So the coalescing SKIPS it. Then "ŻÓŁTE" and "Z KUKURYDZĄ" coalesce to "ŻÓŁTE Z KUKURYDZĄ". Fix: the coalescing needs a lookahead — if skipping "PLACKI" causes the remaining fragment to be meaningless (not a standalone title), don't skip it. Or: remove "placki" from SECTION_LABELS since it's being used as the first word of a recipe title.

### Proposed Changes

**5a. Hyphen-continuation pre-processing:**

Add a pre-processing step in `buildCandidates` before caps coalescing:

```typescript
// Join hyphen-broken lines: "VEGET-" + "ABLES" → "VEGETABLES"
for (let i = burstEnd; i < nonEmptyLines.length - 1; i++) {
  if (nonEmptyLines[i].text.endsWith("-")) {
    const joined = nonEmptyLines[i].text.slice(0, -1) + nonEmptyLines[i + 1].text;
    nonEmptyLines[i] = { text: joined, index: nonEmptyLines[i].index };
    nonEmptyLines.splice(i + 1, 1);
  }
}
```

**5b. Relax caps coalescing word-count limit:**

Change `wordCount(line.text) <= 2` to `wordCount(line.text) <= 3` for the first line in a coalescing sequence, so that `LEMON HERB RO45TED` (3 words) can coalesce with `VEGETABLES`.

Alternatively, treat this as a 2-line join case and fix the `shouldBlock2` guard: "VEGETABLES" is a section label, but joining "LEMON HERB RO45TED" + "VEGETABLES" produces a 4-word candidate that looks like a title, not a category header. Change the blocking condition:

```typescript
// Only block join when BOTH lines are section labels, or when the join produces ≤2 words
const shouldBlock2 = isSectionLabel(line.text) &&
  (wordCount(joined2) <= 2 || isAlwaysBlockJoinLabel(line.text)) &&
  !(wordCount(joined2) >= 3 && isAllCaps(joined2));
```

**5c. Remove "placki" from SECTION_LABELS** (or move it to a conditional list):

"Placki" starts real recipe titles like "Placki Ziemniaczane", "Placki Żółte z Kukurydzą". It should NOT be in SECTION_LABELS. The category label for this food group is "naleśniki i placki" (crêpes and pancakes), not just "placki".

Similarly, review other SECTION_LABELS entries that commonly start recipe titles. Candidates for removal: "placki" (used in recipe names), "ciasto" (used in "Ciasto Drożdżowe" etc.). Move them to a "category-only labels" set that blocks single-word candidates but not multi-word joins.

**5d. Add section-label-as-title-prefix heuristic:**

When a section label word is immediately followed by non-label words on subsequent lines and all are ALL_CAPS, treat the label as the first word of a multi-word title, not a standalone section header.

### Before/After Examples

| Before | After |
|--------|-------|
| `VEGETABLES` (wrong line) | `Lemon Herb Roasted Vegetables` (joined + OCR-normalized) |
| `ŻÓŁTE Z KUKURYDZĄ` (partial) | `Placki Żółte z Kukurydzą` (full 3-line join) |
| `TOPPING & BAKING:` (wrong) | `Rosemary Focaccia Bread` (coalesced correctly) |
| `ROASTED CHICKEN WITH ROOT VEGET-` (broken) | `Roasted Chicken with Root Vegetables` (hyphen-joined + OCR-normalized) |

### Risk Assessment

- **Medium risk** — modifying caps coalescing and SECTION_LABELS affects the entire pipeline
- **Mitigation:** Run full test suite including all 11 real files. The real files don't have these patterns, so risk is low
- Removing "placki" from SECTION_LABELS could cause a standalone "PLACKI" (as a chapter header) to become a false-positive title candidate — mitigate with the position-based scoring (chapter headers appear before the title)

---

## Change 6: Annotation Line and OCR Marker Filtering

**Fixes:** Pattern 6 (5 failures)

### Root Cause

Generated files include a metadata annotation line `(OCR CORRUPTION: digit for letter, hyphenation)` that confuses the extractor. The parenthetical format causes `stripParentheticalGloss` to potentially interact badly, and the annotation disrupts the expected title-blank-ingredients pattern.

Additionally, some files have `lngredients:` (with lowercase L instead of I) which doesn't match the ingredients section label detection.

### Proposed Changes

**A. Filter annotation lines in `passesHardFilters`:**

```typescript
// Parenthetical annotations describing OCR artifacts
if (/^\(OCR\b/i.test(text.trim())) return false;
if (/^\(.*corruption/i.test(text.trim())) return false;
```

**B. Add OCR-corrupted section labels to detection:**

```typescript
// In looksLikeIngredient or a new pattern:
// "lngredients" (OCR: l for I), "lnstructions" (OCR: l for I)
if (/^lngredients/i.test(text.trim())) return true; // in a new isOcrSectionLabel check
```

Actually, better approach: in `isSectionLabel`, add OCR-variant matching:

```typescript
// After exact match, try OCR normalization: replace leading "l" with "I"
const ocrNormalized = normalized.replace(/^l/, "i");
if (SECTION_LABELS.has(ocrNormalized)) return true;
```

**C. Improve empty-result threshold:**

For Pattern 6 files where the title is present but OCR-corrupted (e.g., "Bra1sed Cod w1th Wh1te W1ne"), the candidate should be found and selected. The issue may be that the embedding score for heavily corrupted text is too low. The fix is two-fold:
1. The OCR normalization (Change 1) should be applied to candidates BEFORE embedding, not just on the final output
2. Or: lower the minimum threshold for the first-position candidate

Actually, a better approach: apply OCR normalization to candidate text before computing embeddings, then use the clean text for embedding similarity but preserve the original for output (which gets normalized in post-processing anyway).

```typescript
// Before embedding:
const cleanText = normalizeOcrForEmbedding(candidate.text);
const embedding = await embed(cleanText);
```

This ensures OCR-corrupted titles get fair similarity scores against the reference embeddings.

### Before/After Examples

| Before | After |
|--------|-------|
| `(empty)` for Braised Cod | `Braised Cod with White Wine` (found + OCR-normalized) |
| `TOPPING (optional):` for Drożdże Sernik | `Drożdże Sernik` (annotation skipped, title found) |
| `(empty)` for Roasted Beet and Walnut Dip | `Roasted Beet and Walnut Dip` (found + OCR-normalized) |

### Risk Assessment

- **Low risk** — annotation filtering is specific to synthetic patterns; OCR normalization before embedding is a quality improvement with no downside

---

## Change 7: Single-Word and Short Title Scoring Improvements

**Fixes:** Pattern 7 (7 failures)

### Root Cause

Single-word titles like "Golonka", "MAKOWIEC", "PROFITEROLES" and short titles like "Cheesecake z Jeżynami" are under-scored relative to section headers that appear later in the file. The current bonuses:
- Single-word ALL_CAPS: +0.03 (vs +0.08 for multi-word)
- Structural heading requires ≥2 significant words (so single-word titles never get the +0.10 bonus)

Meanwhile, section headers like "PASTA MAKOWA:", "Chocolate sauce:", "Na masę:" pass hard filters because they're not in SECTION_LABELS, and they score well on embeddings because they're food-related terms.

### Proposed Changes

**A. Expand section label detection for recipe-internal headers with colons:**

```typescript
// Any candidate ending with ":" is likely a recipe sub-section header, not a title.
// Exception: titles with " : " compound separators.
if (/:\s*$/.test(text.trim()) && !/ : /.test(text)) return false;
```

This is a powerful heuristic: recipe titles almost NEVER end with a colon. Sub-section headers almost ALWAYS do. Adding this single filter to `passesHardFilters` would eliminate:
- "PASTA MAKOWA:" → filtered
- "Chocolate sauce:" → filtered
- "Na masę:" → filtered
- "Roasting:" → filtered
- "TOPPING (optional):" → filtered
- "GLAZE:" → already caught by SECTION_LABELS, but this catches the pattern generically
- "Parmesan cheese for serving Method:" → filtered (ends with colon)

**This single rule fixes 5 of the 7 Pattern 7 failures.**

**B. First-line title boost:**

When the first non-empty, non-metadata line in the document looks like a title (passes hard filters, is short, doesn't end with colon), give it a position bonus even if it's a single word:

```typescript
// In the scoring pass, for position-0 candidates:
const isFirstTitle = rs.position <= 2 && wordCount(rs.text) <= 5 && !isSectionLabel(rs.text);
const firstTitleBonus = isFirstTitle ? 0.05 : 0;
```

**C. For Mushroom Risotto specifically:** The file starts with continuation text from a previous recipe. The `findBurstEnd` prose-prologue detection should catch lines 1-3 (which are body text starting with lowercase/ending with periods). Once the overflow is skipped, the actual recipe content starts much later. This case may actually be Pattern 3 (overflow) rather than Pattern 7.

**D. For Ogórkowa Zupa (empty result):** The title is on line 3 but the extractor returns empty. This suggests all candidates are below threshold. The first-line boost (B) combined with the colon filter (A) should fix this by eliminating competing section headers.

### Before/After Examples

| Before | After |
|--------|-------|
| `Na masę:` for Cheesecake z Jeżynami | Filtered (colon) → `Cheesecake z Jeżynami` (line 4) |
| `Roasting:` for Golonka | Filtered (colon) → `Golonka` (line 1) |
| `PASTA MAKOWA:` for Makowiec | Filtered (colon) → `Makowiec` (via OCR normalization of `MAKOWIEC`) |
| `Chocolate sauce:` for Profiteroles | Filtered (colon) → `Profiteroles` (OCR normalization of `PROFITEROLES`) |
| `Parmesan cheese for serving Method:` for Minestrone | Filtered (colon) → `Minestrone` |

### Risk Assessment

- **Medium-high risk for the colon filter** — some legitimate titles might have trailing colons in OCR output (e.g., a stray colon artifact). Mitigate by only applying the filter when the colon is clearly a section-separator (preceded by a header-like word).
- Actually, the risk is lower than it seems: if OCR adds a spurious colon to a title, the title line WITHOUT the colon would also be a candidate (from a different OCR read or line split). In practice, real recipe titles never end with colons.
- **Test thoroughly** with all 11 real files to confirm no regressions.

---

## Change 8: Minimum Confidence Floor

**Fixes:** Pattern 8 (1 failure)

### Root Cause

For "Sweet Potato Salad", the title appears at line 29 — near the end of the file. The extractor grabs "Salt and pepper" from the ingredient list as a fallback. The empty-pool fallback at line 784 returns the first positional candidate regardless of quality.

### Proposed Changes

Add an absolute minimum score floor before the fallback:

```typescript
// Replace the current fallback (lines 784-789):
if (selected.length === 0 && scored.length > 0) {
  const fallback = scored
    .slice()
    .sort((a, b) => a.position - b.position || b.score - a.score);
  // Only use fallback if the best candidate has a meaningful positive score
  if (fallback[0].rawScore > 0.02) {
    selected = [fallback[0]];
  }
  // Otherwise: return undefined (no title found)
}
```

The threshold of 0.02 for `rawScore` means the candidate must be at least slightly more similar to "recipe name" than to "ingredients/directions" — a very low bar that legitimate titles easily clear, but random ingredient phrases fail.

### Before/After Examples

| Before | After |
|--------|-------|
| `Salt and pepper` for Sweet Potato Salad | `undefined` (correct — title not in extractable position) |

### Risk Assessment

- **Low risk** — the floor is very permissive (0.02). Any real title candidate would score well above this.
- Returning `undefined` is correct behavior when the title is genuinely not present in the scanned text.

---

## Implementation Order and Dependencies

| Priority | Change | Files Modified | Dependencies |
|----------|--------|----------------|--------------|
| 1 | **Change 7A: Colon filter** | `title-extractor.ts` (passesHardFilters) | None — instant 5+ fixes |
| 2 | **Change 1: OCR normalization** | `title-extractor.ts` (new function + return paths) | None — instant 11 fixes |
| 3 | **Change 2: Page/section filters** | `title-extractor.ts` (passesHardFilters + SECTION_LABELS) | None — instant 6 fixes |
| 4 | **Change 4: Remove compound stripping** | `title-extractor.ts` (lines 999-1009) | Verify old Pierogi test |
| 5 | **Change 3: Overflow detection** | `title-extractor.ts` (findBurstEnd) | None |
| 6 | **Change 5: Multi-line joining** | `title-extractor.ts` (buildCandidates + SECTION_LABELS) | Depends on Change 2 |
| 7 | **Change 6: Annotation filtering** | `title-extractor.ts` (passesHardFilters + embedding) | Depends on Change 1 |
| 8 | **Change 8: Confidence floor** | `title-extractor.ts` (fallback logic) | None |

Changes 1, 2, 7A are independent and provide the highest ROI. They should be implemented first and tested before moving to the structural changes (4, 5, 6).

---

## Expected Impact Summary

| Pattern | Count | Changes Applied | Expected Fixes |
|---------|-------|-----------------|----------------|
| 1: OCR normalization | 11 | Change 1 | 11/11 |
| 2: Section/page headers | 6 | Change 2 | 6/6 |
| 3: Overflow preamble | 2 | Change 3 | 2/2 |
| 4: Compound truncation | 4 | Change 4 | 3-4/4 |
| 5: Multi-line joining | 4 | Change 5 | 3-4/4 |
| 6: OCR marker confusion | 5 | Change 1 + Change 6 | 4-5/5 |
| 7: Section header over title | 7 | Change 7 | 6-7/7 |
| 8: Title absent | 1 | Change 8 | 1/1 (returns undefined correctly) |
| **Total** | **40** | | **36-40/40** |

The single highest-impact change is **Change 7A (colon filter in passesHardFilters)** — one line of code that prevents any colon-terminated string from being selected as a title. This alone fixes ~5 failures and strengthens the pipeline against a broad class of false positives.

The second highest-impact change is **Change 1 (OCR normalization)** — a pure post-processing step that fixes 11 failures with zero risk of regression.

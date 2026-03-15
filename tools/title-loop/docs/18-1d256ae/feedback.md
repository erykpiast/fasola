# Iteration 18 — Failure Analysis

## Overview

54 failures out of 203 test cases (73% pass rate). The failures cluster into 8 distinct root-cause patterns. Most failures involve one of two dominant issues: **ALL_CAPS vs. Title Case mismatch** (algorithm faithfully returns OCR casing but test expects canonical mixed case) and **OCR garbage prologue that bypasses burst detection** (long garbage lines sneak through and beat the real title). Several other structural bugs account for the remainder.

---

## Pattern 1: ALL_CAPS Title in OCR, Mixed-Case Expected (largest group, ~20 failures)

**Affected files:** Barszcz, Beef Stew, Mushroom Pasta, Mushroom Barley Soup, Kluski Śląskie, Pierogi Ruskie, Placki Serowe, Placki Ziemniaczane, Placki Owocowe, Placki Słodkie, Roladki Szpinakowe, Paella Valenciana, Chocolate Brownies + Fudgy Chocolate Brownies, and others.

**What the OCR has:** The recipe title is in ALL_CAPS (e.g., `BARSZCZ`, `BEEF STEW`, `MUSHROOM PASTA`, `PLACKI SEROWE`).

**What the algorithm returns:** The verbatim OCR string in ALL_CAPS (e.g., `BARSZCZ`, `BEEF STEW`).

**What the test expects:** Title-cased string (e.g., `Barszcz`, `Beef Stew`, `Placki Serowe`).

**Why it fails:** The algorithm has no case normalization step. It returns text exactly as it appears in the OCR. Tests that have ALL_CAPS expectations (e.g., `KREM SELEROWY Z GORGONZOLA`, `ARAYES SHRAK`) pass because the expected string matches the OCR. Tests with Title Case expectations fail because the expected string differs in case.

**Concrete trace — Barszcz:**
```
File line 1: BARSZCZ
Expected:    Barszcz
Got:         BARSZCZ
```
`BARSZCZ` is a valid single-word structural candidate. It passes all hard filters and scores well for recipe title. The algorithm returns it faithfully. The test fails on a string-equality comparison.

**Concrete trace — Paella Valenciana:**
```
File line 1: PAELLA
File line 2: VALENCIANA
```
Both are ALL_CAPS single-word lines (≤2 words, ≤25 chars). The caps-coalescing logic correctly merges them into `PAELLA VALENCIANA`. But expected is `Paella Valenciana`. Case mismatch.

---

## Pattern 2: Polish Preposition `ze` Triggers Garbled-Word False Positive

**Affected files:** Krem Grzybowy ze Śmietaną, Konfitury ze Liwek.

**Why it fails:** The `isLikelyGarbled` multi-word check flags any short (≤2 letter) lowercase word that is not in `commonShort2`. The set `commonShort2` contains `"z"` (common Polish preposition) but NOT `"ze"` (its form used before consonant clusters). The title `Krem Grzybowy ze Śmietaną` contains `ze`, which:
- starts with lowercase `z` → `/^[a-z]/` matches
- `"ze".replace(/[^a-z]/g, "")` = `"ze"`, length 2 ≤ 2
- `"ze"` is not in `commonShort2`

So `isLikelyGarbled("Krem Grzybowy ze Śmietaną")` returns `true`, and `passesHardFilters` returns `false`. The actual title is entirely absent from the candidate pool. The algorithm picks something else (likely a body-text or ingredient line).

**Concrete trace — Krem Grzybowy ze Śmietaną:**
```
File line 1: Krem Grzybowy ze Śmietaną   ← filtered out; ze not in commonShort2
File line 8: Składniki (4-5 porcji)      ← survives, becomes best candidate
```

---

## Pattern 3: Two-Word Title Split Across Lines — Dedup Removes the Compound

**Affected files:** Lamb Stew, Żur Żytni, and likely others.

**Why it fails:** When a two-word title is split across two lines, each word becomes both a valid single-line candidate AND part of a 2-line join candidate. The dedup logic ("keep the shorter substring") then removes the compound join.

**Concrete trace — Lamb Stew:**
```
File line 1: Lamb     ← single candidate: passes (4 ASCII letters, vowel ratio OK)
File line 2: Stew     ← single candidate: passes (4 ASCII letters, vowel ratio OK)
2-line join: Lamb Stew ← also generated
```
All three pass threshold. Dedup runs:
- `Lamb Stew` contains `Lamb` (shorter) → `Lamb Stew` removed
- `Lamb Stew` contains `Stew` (shorter) → `Lamb Stew` removed
- Result: `Lamb` and `Stew` survive → returns `Lamb + Stew`

Expected `Lamb Stew`. The compound title is destroyed by its own component parts.

**Concrete trace — Żur Żytni:**
```
File line 1: Żur     ← isLikelyGarbled (Ż is non-ASCII, ASCII letters = "ur" = 2 chars, triggers single-word short rule)
File line 2: żytni   ← single candidate
2-line join: Żur żytni  ← generated with lowercase ż
Expected:    Żur Żytni   ← Title Case mismatch AND the join is case-wrong
```
Additionally, `Żur` alone (ASCII letters = `ur`, 2 chars, not in COMMON_SHORT) is filtered as garbled. The 2-line join `Żur żytni` survives but has wrong casing on the second word, so even if returned it doesn't match.

---

## Pattern 4: Three-Line Title Where First Word Is a SECTION_LABEL

**Affected files:** Zupy Zimowe Warzywne.

**What the OCR has:**
```
Zupy
Zimowe
Warzywne
```

**Why it fails:** `Zupy` appears in `SECTION_LABELS` (as a Polish category word meaning "soups"). The `buildCandidates` function skips 2-line and 3-line joins when the first line is a section label:

```typescript
if (i + 1 < mergedLines.length && !isSectionLabel(line.text)) {
    // 2-line join only generated if first line is NOT a section label
```

Since `isSectionLabel("Zupy")` returns `true`, no join starting with `Zupy` is ever generated. The only surviving candidates are `Zimowe` (a single word, unusual English/Polish mix) and `Warzywne` (a single word). Neither matches the expected `Zupy Zimowe Warzywne`.

The SECTION_LABELS entry is correct when `Zupy` appears as a standalone chapter header — but it incorrectly blocks reconstruction when `Zupy` is the start of a recipe title split across lines.

---

## Pattern 5: Long OCR Garbage Prologue Bypasses Burst Detection

**Affected files:** Brownies, Sernik, Szarlotka, Zupa Grzybowa, Lemonade, Strawberry Shortcake, Strawberry Smoothie, Tomato Bisque, Tomato Chutney, Vegetable Stir Fry, Quick Golabki, and others.

**Template structure:** These files start with ~28-35 lines of repeated OCR garbage instruction fragments (e.g., `½ cup plus ı tablespoon of finely ground`, `nto a loured work counter and knead until smooth`, `Beat egg whites until stiff peaks form, then fold`), followed by the actual recipe name as a simple mixed-case word, then a generic template recipe body.

**Why it fails:** `findBurstEnd` only skips lines that are BOTH short (< 20 chars) AND garbled. The garbage lines in these files are long (30–55 chars), so `findBurstEnd` returns 0 and all lines are processed.

Several garbage lines pass `passesHardFilters`:
- `Beat egg whites until stiff peaks form, then fold` — starts with uppercase `B`, no period-space pattern, all short lowercase words exceed 2 chars → passes
- `Cool completely on a wire rack before serving` — same
- `Remove from heat and stir in the cream` — same

These become candidates. The actual title (`Szarlotka`, `Sernik`, etc.) is at ~70% through the document, gets no position bonus, and is a single uncommon Polish word. These competing candidates inflate the scoring pool and may push the real title below threshold or cause a wrong winner.

**Concrete trace — Szarlotka:**
```
Lines 1–35:  OCR garbage (long lines, mostly pass filters)
Line 36:     Szarlotka   ← at 70% of document, no position bonus
Lines 38–56: Generic template ingredients/instructions
```
The algorithm has 20+ candidates before the title and must identify `Szarlotka` from among generic English cooking instructions. If the threshold is set by any garbage line with accidentally high embedding similarity to a recipe title, `Szarlotka` may not survive.

---

## Pattern 6: Season/Context Header Wins Over Mixed-Case Title

**Affected files:** Beet Salad, Coleslaw, and similar files with `SEZON: WIOSNA` header.

**Structure:**
```
SEZON: WIOSNA   ← line 1, ALL_CAPS, passes hard filters
[blank]
Beet Salad      ← line 3, mixed case
```

**Why it fails:** `SEZON: WIOSNA` passes hard filters and `isStructuralHeading` check (ALL_CAPS, 2 words, both ≥4 letters). It gets a 0.10 structural bonus AND a 0.12 position bonus (position 0). `Beet Salad` at position 2 gets a smaller position bonus and no structural bonus. The algorithm picks `SEZON: WIOSNA`.

The `METADATA_PATTERNS` list handles `DLA`, `SERVES`, `PREP TIME`, etc. but does not include `SEZON:` (season indicator). Seasonal recipe categorization headers like `SEZON: WIOSNA`, `SEZON: JESIEŃ` are not recognized as metadata.

---

## Pattern 7: Parenthetical English Subtitles Over-Merged Into Title

**Affected files:** Piernik, Żurek, Pierogi Ruskie, Bigos Myśliwski, Makowiec.

**What the OCR has:**
```
PIEROGI RUSKIE
(Boiled Dumplings with Potato and Cheese)
```
or:
```
MAKOWIEC (Polish Poppy Seed Cake)   ← already on one line
```

**Why it fails:** The continuation pre-merge step merges any line starting with `(` into the preceding line (designed for `SAFFRON WHEAT BUNS / COTTAGE CHEESE (VARIATION D)`). This incorrectly merges English subtitle glosses.

Result: `PIEROGI RUSKIE (Boiled Dumplings with Potato and Cheese)` becomes the candidate instead of `PIEROGI RUSKIE`. The expected is `Pierogi Ruskie`. Two problems: ALL_CAPS mismatch AND parenthetical inclusion.

For single-line cases (`MAKOWIEC (Polish Poppy Seed Cake)`), `isAllCaps` returns `false` (the parenthetical content is mixed case), so the line doesn't qualify as a structural heading, and the full string including the gloss is returned as a mixed-case title — while `Makowiec` alone is expected.

---

## Pattern 8: Compound Title Destroyed by Dedup via Substring

**Affected file:** HERB BAKED SALMON + DILL SAUCE VARIATION.

**Structure:**
```
HERB BAKED SALMON + DILL SAUCE VARIATION  ← line 1 (compound title)
[blank]
HERB BAKED SALMON                          ← line 3 (first sub-recipe header)
...
DILL SAUCE VARIATION                       ← line 32 (second sub-recipe header)
```

**Why it fails:** `HERB BAKED SALMON + DILL SAUCE VARIATION` at line 1 is the correct answer. All three ALL_CAPS candidates survive threshold. The continuation logic correctly identifies `HERB BAKED SALMON + DILL SAUCE VARIATION` as `firstStructuralHeading`. The prefix-removal step correctly removes `HERB BAKED SALMON`. However, `DILL SAUCE VARIATION` (position 32) also survives.

Dedup then runs on `[HERB BAKED SALMON + DILL SAUCE VARIATION, DILL SAUCE VARIATION]`:
- `HERB BAKED SALMON + DILL SAUCE VARIATION` **contains** `DILL SAUCE VARIATION` (shorter)
- → The longer compound title is removed; only `DILL SAUCE VARIATION` survives

The dedup rule "keep the shorter" is correct in general but breaks when the compound line-1 title literally contains a later sub-recipe section header as a substring.

---

## Minor Patterns

### Pattern 9: Page Number Prefix Blocks Title Line
**File:** Berry Jam.

OCR line 3: `34  Berry Jam`. The `startsWithNumber` check matches (line begins with digit `3`). The entire line is discarded. `Berry Jam` never appears as a standalone candidate.

### Pattern 10: OCR Character Substitution in Title
**File:** Crème Brûlée.

OCR line 1: `Crème Brû1ée` (digit `1` substituted for letter `l`). The algorithm returns the corrupted OCR string. Expected: `Crème Brûlée`. The algorithm does no character-substitution correction.

### Pattern 11: Missing Word in OCR Split Title
**File:** Bigos z Wdzonych Kielbas.

OCR: `Bigos` (line 1) + `Wdzonych Kielbas` (line 2). The preposition `z` is absent from the OCR. The 2-line join produces `Bigos Wdzonych Kielbas`. Expected: `Bigos z Wdzonych Kielbas`. An OCR omission that cannot be recovered without external knowledge.

---

## Common Themes

### 1. No case normalization
The algorithm treats OCR casing as ground truth. Roughly a third of failures are pure ALL_CAPS vs. Title Case mismatches where the algorithm found the right title content but returned it in the wrong case. Adding a normalization pass (e.g., Title Case for mixed-alpha strings, preserve ALL_CAPS only when all non-trivial words are ≥5 chars or it's a known-ALL-CAPS pattern) would eliminate the largest single failure cluster.

### 2. The garbled-word filter is too aggressive for non-ASCII short words
`ze`, and potentially other valid 2-letter tokens in languages with non-ASCII characters, are treated as garbage because the `commonShort2` set is ASCII-English-centric and the `[a-z]` regex only matches ASCII. Words like `ze`, `bo`, `ni`, `tu` are legitimate Polish words/prepositions but all fail the filter. The fix is to add Polish short prepositions to `commonShort2` (at minimum: `ze`, `bo`, `na`, `ni`, `po`, `ku`).

### 3. The burst-detection threshold (< 20 chars) is too narrow
Long repeated OCR garbage lines bypass `findBurstEnd` because they exceed 20 characters. The burst detection should also recognize long repeated lines (appearing ≥2 times before the first likely title candidate) as garbage preamble. Alternatively, a repeated-line filter (any line appearing ≥3 times in the document is noise) would handle these template-garbage files.

### 4. The "shorter wins" dedup rule and the "section labels block joins" rule each have known exceptions
- The dedup rule breaks when a compound title on line 1 contains a later sub-recipe header as a literal substring (HERB BAKED SALMON + DILL SAUCE VARIATION).
- The section-label join-block rule breaks when a category word (`Zupy`, potentially `Placki`) starts a multi-line recipe title rather than standing alone as a category.

These two rules are already annotated in the code as sensitive ("DO NOT CHANGE THIS LOGIC"), so any fix should be targeted rather than broad.

### 5. Continuation pre-merge is too aggressive with `(`
The `(` continuation character is designed for recipe variant suffixes like `(VARIATION D)`. It also matches English subtitle glosses like `(Polish Gingerbread)` and `(Hunter's Stew)`. A simple guard — don't merge `(` continuations when the preceding line is already a complete multi-word title — would prevent most cases in Pattern 7.

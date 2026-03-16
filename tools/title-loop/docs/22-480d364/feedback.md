# Iteration 22 – Failure Analysis

All 40 failures are generated files. Zero real files failed.

---

## Pattern 1: OCR digit/letter substitution accepted verbatim (11 failures)

The extractor correctly identifies the title line but returns the OCR-corrupted text as-is instead of normalizing it to the clean expected string.

| File | Extracted | Expected |
|------|-----------|----------|
| Barszcz Czerwony | B4RSZCZ CZERWONY | Barszcz Czerwony |
| Beet Arugula Salad | BEET ARUGU1A SA1AD | Beet Arugula Salad |
| Bigos Śliwkowy z Bekonem | B¡gos Śl¡wkowy z Bekonem | Bigos Śliwkowy z Bekonem |
| Blackberry Fool | B1ACKBERRY FOO1 | Blackberry Fool |
| Chleb Pszenny Razowy | CH1EB PSZENNY RAZOWY | Chleb Pszenny Razowy |
| Kopytka z Pieczarkami Leśnymi | KoPyTka z P¡eczarkami Leśnymi | Kopytka z Pieczarkami Leśnymi |
| Lemon Herb Grilled Chicken | LEMON HERB GRILÍED CHICKEN | Lemon Herb Grilled Chicken |
| Makowiec ze Śliwkami | MAK0WIEC ZE ŚLIWKAMI + SERVÍNG AND STORAGE: | Makowiec ze Śliwkami |
| Pierniki Śliwkowe | P1ERNIKI ŚLIWKOWE | Pierniki Śliwkowe |
| Sole with Brown Butter and Capers | S01e with Brown Butter and Capers | Sole with Brown Butter and Capers |
| Tomato Lentil Soup | TOMATO LENT1L SOUP | Tomato Lentil Soup |

**Why:** The extraction step is succeeding (right line is found) but there is no post-processing normalization pass. Substitutions like `1→l/i`, `0→O`, `4→a`, `¡→i`, and stray Unicode lookalikes are passed through unchanged. The Makowiec ze Śliwkami case additionally shows the extractor greedily appending text from the next section header.

---

## Pattern 2: Section/category header or page reference chosen over title (6 failures)

When a chapter label, section name, or "Page N" line appears above the actual recipe title, the extractor picks that line instead.

| File | Extracted | Actual title line |
|------|-----------|-------------------|
| Baked Cod with Herbs | Page 42 | Baked Cod with Herbs (line 3) |
| Brussels Sprouts and Bacon Soup | Page 102 - SOUPS & BROTHS | Brussels Sprouts and Bacon Soup (line 3) |
| Chocolate Chip Cookies | Page 23 - DESSERTS & BAKED GOODS | CHOCOLATE CHIP COOKIES (line 1) |
| Halibut with Saffron Cream Sauce | FISH & SEAFOOD | Halibut with Saffron Cream Sauce (line 3) |
| Kielbasa z Cebulą | Strona 65 - MIĘSA I WĘDZENIA | KIELBASA Z CEBULĄ (line 3) |
| Roasted Asparagus with Parmesan | VEGETABLES | Roasted Asparagus with Parmesan (line 3) |

**Why:** The extractor appears to prefer the first prominent-looking text (often ALL CAPS or including "Page"), which in these files is a section or chapter header. The actual recipe title immediately follows and is visually subordinate. The extractor needs to recognize patterns like `Page N`, `Page N - SECTION`, `SECTION NAME` (single word or short generic noun) and skip them.

---

## Pattern 3: Previous-page overflow content at file start (2 failures)

The file begins with a "PREVIOUS RECIPE OVERFLOW" or "PREVIOUS PAGE CONTENT" block — a fragment from the prior page — before the actual recipe starts.

| File | Extracted |
|------|-----------|
| Beet and Goat Cheese Salad | PREVIOUS RECIPE OVERFLOW: |
| Roasted Garlic Broccoli | PREVIOUS PAGE CONTENT - RECIPE FRAGMENT |

**Why:** The extractor naively treats the first prominent text as the title. These preamble blocks must be detected and skipped. A heuristic: lines containing "OVERFLOW", "PREVIOUS", "CONTINUATION", or "PAGE CONTENT" with no ingredient/recipe structure following immediately should be discarded.

---

## Pattern 4: Multi-part dual-recipe title truncated (4 failures)

Titles that use ` : ` or ` + ` to represent two recipes in one document are shortened to just the first part (or a wrong part).

| File | Extracted | Expected |
|------|-----------|----------|
| LEMON CURD : LEMON CURD WITH THYME | LEMON CURD | LEMON CURD : LEMON CURD WITH THYME |
| HERB ROASTED PORK WITH MUSHROOMS : PORK WITH CARAMELIZED ONIONS (VARIATION) | VARIATION: PORK WITH CARAMELIZED ONIONS | HERB ROASTED PORK WITH MUSHROOMS : PORK WITH CARAMELIZED ONIONS (VARIATION) |
| PORK CHOPS WITH APPLES : PORK CHOPS WITH MUSHROOM SAUCE | PORK CHOPS WITH APPLES | PORK CHOPS WITH APPLES : PORK CHOPS WITH MUSHROOM SAUCE |
| PIERNIK TRADYCYJNY + PIERNIK NOWOCZESNY Z CZEKOLADĄ | WERSJA NOWOCZESNA Z CZEKOLADĄ | PIERNIK TRADYCYJNY + PIERNIK NOWOCZESNY Z CZEKOLADĄ |

**Why:** The extractor either splits on ` : ` / ` + ` or finds a later section heading that matches the second recipe name better. The full title line (the one matching the `TITLE : VARIATION` structure) should be returned whole.

---

## Pattern 5: Multi-line title — only one fragment captured (4 failures)

The title is split across two or three consecutive short lines with no other text between them. The extractor picks one fragment (usually the last or first) rather than joining them.

| File | Raw title lines | Extracted |
|------|-----------------|-----------|
| Lemon Herb Roasted Vegetables | `LEMON HERB RO45TED` / `VEGETABLES` | VEGETABLES |
| Placki Żółte z Kukurydzą | `PLACKI` / `ŻÓŁTE` / `Z KUKURYDZĄ` | ŻÓŁTE Z KUKURYDZĄ |
| Rosemary Focaccia Bread | `ROSEMARY` / `FOCACCIA` / `BREAD` | TOPPING & BAKING: |
| Roasted Chicken with Root Vegetables | `ROASTED CHICKEN WITH ROOT VEGET-` / `ABLES` | ROASTED CHICKEN WITH ROOT VEGET- |

**Why:** For Lemon Herb Roasted Vegetables and Placki, the extractor picks just one of the lines. For Rosemary Focaccia Bread it misses the title entirely and falls through to a section header. For Roasted Chicken it correctly finds the first fragment but doesn't join the hyphenated continuation. Multi-line title reconstruction requires: detecting consecutive short all-caps lines that form a single noun phrase, and joining hyphen-broken words at line boundaries.

---

## Pattern 6: Files with "(OCR CORRUPTION: …)" marker — extractor fails (5 failures)

A set of generated files follows this template:
```
Title Here

(OCR CORRUPTION: digit for letter, hyphenation)

lngredients:
```
The extractor either returns empty or falls through to grab something from inside the recipe body.

| File | Extracted |
|------|-----------|
| Braised Cod with White Wine | *(empty)* |
| Drożdże Sernik | TOPPING (optional): |
| Piernik z Śliwkami | Podaw4ć ciepło ze śmietaną lub lodami. |
| Roasted Beet and Walnut Dip | *(empty)* |
| Żurek Krakowski | XxYyZz salt and pepper |

**Why:** The title line itself is present (and first), but the `(OCR CORRUPTION: …)` annotation line on line 3 or the `lngredients:` misspelling may confuse the extractor's scoring. It likely rejects the title line due to the corruption artifacts and then searches deeper into the file where it finds noise. Parenthetical annotation lines should be ignored, not cause the extractor to abandon the title candidate.

---

## Pattern 7: Recipe section header returned instead of title (7 failures)

The title is present near the top of the file, but the extractor returns a section heading from deeper in the recipe (e.g., "PASTA MAKOWA:", "Roasting:", "Chocolate sauce:").

| File | Extracted | Title location |
|------|-----------|----------------|
| Cheesecake z Jeżynami | Na masę: | Line 4 |
| Golonka | Roasting: | Line 1 |
| Makowiec | PASTA MAKOWA: | Line 2 |
| Minestrone | Parmesan cheese for serving Method: | Line 4 |
| Mushroom Risotto | CARPACCIO DI PESCE SPADA + CARPACCIO WITH CITRUS DRESSING | Line 2 |
| Ogórkowa Zupa | *(empty)* | Line 3 |
| Profiteroles | Chocolate sauce: | Line 1 |

**Why:** Varied causes. For Golonka, the subtitle "Roasted Pork Knuckle" on line 2 may cause the extractor to prefer the section heading over the single-word title on line 1. For Minestrone, Cheesecake z Jeżynami, and Ogórkowa Zupa, the initial metadata/season/serving-size line likely scores higher than the real title. For Mushroom Risotto and Profiteroles the extractor skips past the title entirely. Common thread: the extractor's confidence scoring is being misled by short titles, single-word titles, or metadata-rich first lines.

---

## Pattern 8: Title missing entirely from the scanned portion (1 failure)

| File | Extracted | Reason |
|------|-----------|--------|
| Sweet Potato Salad | Salt and pepper | File starts directly with ingredient list; no title in visible lines |

**Why:** The title was apparently lost (not present in the file). The extractor correctly finds nothing valid but then falls through to a random ingredient phrase. When no title candidate scores above a minimum threshold, the extractor should return empty rather than a fallback.

---

## Summary table

| Pattern | Count | Affects real files? |
|---------|-------|---------------------|
| OCR corruption accepted verbatim | 11 | Unknown — no real failures this iteration, but plausible |
| Section header / page ref chosen | 6 | Possible (real books have chapter headers) |
| Previous-page overflow | 2 | Generated only (artificial failure mode) |
| Multi-part title truncated | 4 | Possible (real recipe books have variation pages) |
| Multi-line title not joined | 4 | Possible (large-format print layouts) |
| OCR CORRUPTION marker confuses extractor | 5 | Generated only (template artifact) |
| Recipe section header returned | 7 | Yes — single-word/short titles and metadata headers are real |
| Title absent from file | 1 | Possible |

The highest-impact patterns to fix next are **#1 (OCR normalization)**, **#2 (section/page header skipping)**, **#7 (short-title scoring)**, and **#5 (multi-line title joining)**, as all four likely affect real files.

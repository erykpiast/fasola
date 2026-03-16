# Iteration 24 Failure Analysis

All 18 failures are on generated files. No real-file failures.

---

## Pattern 1: OCR digit-for-letter in title — partial correction (4 failures)

**Cases:** Beet Arugula Salad, Blackberry Fool, Chleb Pszenny Razowy, Lemon Herb Grilled Chicken

**What happened:** The title was correctly identified as the first line, but OCR artifacts
(1→l/i, Í→I) were not fully normalized. The extractor returned the title with residual
corruption rather than the clean form.

```
"BEET ARUGU1A SA1AD"  →  "Beet Aruguia Saiad"   (expected: Beet Arugula Salad)
"B1ACKBERRY FOO1"    →  "Biackberry Fooi"        (expected: Blackberry Fool)
"CH1EB PSZENNY RAZOWY" → "Chieb Pszenny Razowy"  (expected: Chleb Pszenny Razowy)
"LEMON HERB GRILÍED CHICKEN" → "Lemon Herb Grilied Chicken"
```

**Why:** The extractor is doing some normalization (e.g. lowercasing, stripping formatting)
but not applying consistent digit-to-letter substitution rules. `1` is sometimes converted
to `l` and sometimes to `i`, with no semantic check.

---

## Pattern 2: OCR corruption annotation confuses extractor (5 failures)

**Cases:** Braised Cod with White Wine, Drożdże Sernik, Piernik z Śliwkami, Roasted Beet
and Walnut Dip, Żurek Krakowski

**What happened:** The title IS the first line, but it's followed immediately by an
`(OCR CORRUPTION: ...)` annotation on line 3 and `lngredients:` (l for I) on line 5.
The extractor either returned empty or skipped to a random body line:

```
"Bra1sed Cod w1th Wh1te W1ne"  →  ""  (empty)
"Drożdże Sern1k"               →  "Podaw4ć letni lub chłodny."  (serving instruction)
"P1ern1k z Śliwkami"           →  "Podaw4ć ciepło ze śmietaną lub lodami."
"Roasted Beet and Walnut D1p"  →  ""  (empty)
"Żurek Krakowski"              →  "XxYyZz salt and pepper"
```

**Why:** The `(OCR CORRUPTION: ...)` annotation and the garbage tokens throughout the body
(e.g. `XxYyZz`, `Podaw4ć`) are being misread — the extractor apparently discards the first
line as too corrupted (it contains digits), then fails to find a clean candidate, and
either returns empty or picks the first "sentence-like" string from the body.

---

## Pattern 3: Category/section header precedes the actual title (3 failures)

**Cases:** Halibut with Saffron Cream Sauce, Roasted Asparagus with Parmesan, Ogórkowa Zupa

**What happened:** A non-title line appears before the recipe title — either a book-section
label (`FISH & SEAFOOD`, `VEGETABLES`) or a metadata bar (`Lato | Zupy | DLA 4 OSÓB | ...`).
The extractor misidentifies what follows as description, not title:

```
"FISH & SEAFOOD" / "Halibut with Saffron Cream Sauce" → "In same pan, sauté shallots..."
"VEGETABLES" / "Roasted Asparagus with Parmesan"      → "Simple yet elegant vegetable dish..."
"Lato | Zupy | DLA 4 OSÓB | ..." / "OGÓRKOWA ZUPA"   → ""
```

**Why:** The extractor treats the first prominent all-caps or pipe-delimited line as the
title, pushing the actual title into a "description" position that it then skips, ultimately
falling through to a body sentence or returning empty.

---

## Pattern 4: Title absent from the beginning of captured text (2 failures)

**Cases:** Mushroom Risotto, Sweet Potato Salad

**What happened:** The OCR capture starts mid-recipe — either mid-instruction or straight
at the ingredient list — so there is no title present at all:

```
Mushroom Risotto: starts with "Reduce heat and stir in the remaining stock..."
  → extracted "CARPACCIO DI PESCE SPADA + CARPACCIO WITH CITRUS DRESSING"
     (title of the NEXT recipe in the same file)

Sweet Potato Salad: starts with "2 large sweet potatoes, peeled and cut..."
  → extracted "Salt and pepper"
```

**Why:** With no title available on the page, the extractor either picks up a later recipe's
title (the file contains multiple recipes) or grabs the first short phrase that looks
title-like.

---

## Pattern 5: Compound title with variation notation — only variation extracted (2 failures)

**Cases:** HERB ROASTED PORK WITH MUSHROOMS : PORK WITH CARAMELIZED ONIONS (VARIATION),
PIERNIK TRADYCYJNY + PIERNIK NOWOCZESNY Z CZEKOLADĄ

**What happened:** The full compound title is on line 1, but the extractor discards it in
favor of an internal section header from later in the file:

```
"HERB ROASTED PORK WITH MUSHROOMS : PORK WITH CARAMELIZED ONIONS (VARIATION)"
  → "--VARIATION: PORK WITH CARAMELIZED ONIONS"

"PIERNIK TRADYCYJNY + PIERNIK NOWOCZESNY Z CZEKOLADĄ"
  → "--WERSJA NOWOCZESNA Z CZEKOLADĄ"
```

**Why:** The `:` and `+` separators in these titles may be triggering split logic that
treats only one segment as the title. The `--` prefix in the output suggests the extractor
is recognizing these as variation markers and outputting only the variation name.

---

## Pattern 6: Polish title + English subtitle on line 2 (1 failure)

**Cases:** Golonka

**What happened:** The first line is the Polish name, the second line is an English
translation/subtitle. The extractor skips both and returns an instruction sentence:

```
"Golonka" / "Roasted Pork Knuckle"
  → "Scatter vegetables around pan. + Sauce: Remove knuckles and vegetables from pan. ..."
```

**Why:** The extractor apparently sees "Golonka" as too short or ambiguous, treats the
English line as a subtitle (not a title), and then falls through to body content. The `+`
separator in the output suggests the instruction-concatenation path was triggered.

---

## Pattern 7: Heavy OCR corruption in body with title on first line (1 failure)

**Cases:** Placki Ziemniaczane

**What happened:** The title `PLACKI ZIEMNIACZANE` is cleanly on line 1, but the body is
extremely corrupted (`SKLADNIK1`, `d0 miałkuchu siatek`, `Sp|aszcz paіką`). The extractor
returned a corrupted body instruction instead:

```
"PLACKI ZIEMNIACZANE"  →  "Sp|aszcz paіką do grubość-ci około 1 centyme-tra."
```

**Why:** Similar to Pattern 2 — pervasive corruption in the body may cause the extractor
to distrust even the clean first line and scan further, landing on a body sentence.

---

## Summary by impact

| Pattern | Count | Affects real files? |
|---------|-------|---------------------|
| 1. OCR digits in title, partial correction | 4 | Possible — real scans can have digit/letter OCR errors |
| 2. OCR corruption annotation confuses extractor | 5 | No — annotation is synthetic test scaffolding |
| 3. Category/section header before title | 3 | Yes — cookbook pages often have chapter headers |
| 4. No title in captured text | 2 | Yes — page crops can miss the title |
| 5. Compound title with `:` / `+` variation | 2 | Yes — multi-recipe pages exist in real data |
| 6. Subtitle on line 2 | 1 | Yes — bilingual titles appear in real cookbook scans |
| 7. Heavy body corruption, clean title skipped | 1 | Possible — bad scan quality in real files |

The highest-priority fixes for real-file robustness are Patterns 3, 4, and 5.

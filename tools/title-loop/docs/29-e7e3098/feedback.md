# Iteration 29 — Failure Analysis

All 9 failures are on generated files (0 real failures).

---

## Pattern 1: OCR digit-for-letter in title → empty extraction (2 cases)

**Cases:** Braised Cod with White Wine, Roasted Beet and Walnut Dip

Both have digit-substituted titles on line 1 (`Bra1sed Cod w1th Wh1te W1ne`, `Roasted Beet and Walnut D1p`) and return an empty string. The extractor appears to discard the corrupted first line as non-title material but then fails to find a fallback candidate, returning nothing instead of the best available option.

---

## Pattern 2: OCR digit-for-letter in title → wrong body line extracted (2 cases)

**Cases:** Drożdże Sernik (`→ "Podaw4ć letni lub chłodny."`), Piernik z Śliwkami (`→ "Podaw4ć ciepło ze śmietaną lub lodami."`)

Similar to Pattern 1 — the corrupted first-line title is rejected — but here the extractor falls through to a body line (a serving instruction at the end) rather than returning empty. The serving instructions themselves contain OCR noise (`Podaw4ć`), suggesting the extractor is scoring these as high-confidence candidates due to some feature (short sentence, sentence-final punctuation?) while ignoring the actual title.

---

## Pattern 3: OCR garbage tokens after clean title → wrong body line extracted (1 case)

**Case:** Żurek Krakowski (`→ "Xxyyzz salt and pepper"`)

The first line is clean (`Żurek Krakowski`), but the document contains garbage-token lines later. The extractor returns `Xxyyzz salt and pepper` — a garbled instruction line — suggesting the garbage tokens are being ranked above the clean title, possibly because the scoring penalizes short/standalone lines or rewards lines near "salt and pepper" ingredient patterns.

---

## Pattern 4: Mixed-case + special chars in title → wrong body line extracted (1 case)

**Case:** Kopytka z Pieczarkami Leśnymi (`→ "Ugotuj ziemniaky. (38)"`)

Title is `KoPyTka z P¡eczarkami Leśnymi` (erratic capitalisation + dotless-i ¡). The extractor skips it and picks `Ugotuj ziemniaky. (38)` — an instruction line with a page/step number suffix. The number in parentheses may be boosting its score as a "structured" candidate.

---

## Pattern 5: Title preceded by metadata header → empty extraction (1 case)

**Case:** Ogórkowa Zupa (`→ ""`)

The document opens with a pipe-separated metadata line (`Lato | Zupy | DLA 4 OSÓB | PRZYGOTOWANIE 15 MIN | GOTOWANIE 20 MIN`) before the actual title `OGÓRKOWA ZUPA`. The extractor returns empty, suggesting it gets confused by the metadata line (likely rejecting it as non-title but then discarding the following title block too, perhaps treating the section as "header region already processed").

---

## Pattern 6: Title not at document start (multi-recipe / mis-scanned) → wrong title extracted (1 case)

**Case:** Mushroom Risotto (`→ "CARPACCIO DI PESCE SPADA + CARPACCIO WITH CITRUS DRESSING"`)

The document starts mid-recipe (with cooking instructions for risotto), with no title at the top. A different dish title (`CARPACCIO DI PESCE SPADA`) appears later in the text. The extractor correctly identifies an all-caps title-like line — but picks the wrong one because the actual recipe title is missing from the document. This is a structural/scan problem the extractor can't easily recover from; the returned value is reasonable given the input.

---

## Pattern 7: Partial OCR normalisation → near-miss extraction (1 case)

**Case:** Sole with Brown Butter and Capers (`→ "S0ie with Brown Butter and Capers"`)

Title line is `S01e with Brown Butter and Capers`. The extractor normalises `1→l` but leaves `0→o` uncorrected, yielding `S0ie` instead of `Sole`. This is a partial digit-to-letter correction; the normalisation step handles some substitutions but not all (specifically misses `0→o`).

---

## Summary

| Pattern | Cases | Root cause | Real files affected? |
|---------|-------|-----------|----------------------|
| Digit-for-letter → empty | 2 | Corrupted title rejected, no fallback | No (generated only) |
| Digit-for-letter → wrong body line | 2 | Corrupted title rejected, body line wins scoring | No (generated only) |
| Garbage tokens → wrong body line | 1 | Garbage tokens outscore clean title | No (generated only) |
| Mixed case + special chars → wrong body line | 1 | Title unrecognised due to ¡ and erratic caps | No (generated only) |
| Metadata header before title → empty | 1 | Metadata region processing discards following title | No (generated only) |
| Title absent from document → wrong title | 1 | Structural scan problem; extractor picks best available | No (generated only) |
| Partial OCR normalisation → near-miss | 1 | `0→o` substitution not handled | No (generated only) |

The most impactful fixes would be: (a) improve digit-to-letter normalisation (`0→o`, `1→l/i`, etc.) before candidate scoring so corrupted titles aren't discarded, and (b) add a strong positional prior for the first non-metadata line to prevent body lines from outscoring the actual title.

# Iteration 21 Failure Analysis

All 40 failures are from generated files. Zero real-file failures.

---

## Pattern A: Chapter/Section header with page number selected as title (7 failures)

The first line is a book-chapter header in the format `CATEGORY NAME   [page#]`. The actual recipe title appears on the next line. The extractor picks the first prominent line, which is the section header.

| Expected | Extracted |
|---|---|
| Braised Fennel with Tomato | `VEGETABLE SIDES                         145` |
| Herb Crusted Cod | `SEAFOOD MAINS                           78` |
| Kluski ze Szpinakiem | `PIELUCHY & MAKARONY                     289` |
| Kompot Gruszowy | `KoNSERWY & NAPOJE                      412` |
| Lemon Basil Pasta | `PASTA & NOODLES                         112` |
| Roasted Sweet Potato Soup | `SOUPS & BROTHS                          234` |
| Spiced Apple Compote | `PRESERVES & CONDIMENTS                  201` |

**Fix signal:** A line whose right-hand side is a standalone page number (e.g. `\s{3,}\d+$`) should be skipped regardless of how prominent it looks.

---

## Pattern B: OCR garbling of correctly-identified title line (10 failures)

The extractor found the right line but OCR errors (digit/letter substitutions, punctuation swaps) prevent an exact match. The title position logic is correct; the content is wrong.

| Expected | Extracted | Key errors |
|---|---|---|
| Beef Stew with Root Vegetables | `BEEF STEW W1TH R00T VEGETABLES` | `I→1`, `O→0` |
| Beet and Walnut Salad | `BEET ANO WALNUT SAL1A` | `D→O` in AND, tail truncated |
| Marinated Mushroom Salad | `MAR1NATED MUSHROOM SALAD` | `I→1` |
| Mushroom Crepe Appetizer | `MUSHROOM CREPE APPET1ZER` | `I→1` |
| Pan-Roasted Chicken with Thyme | `PAN-R0ASTED CHICKEN WITH THYME` | `O→0` |
| Roasted Garlic and Herb Salmon | `ROASTED GARLIC ANO HERB SAL1WN` | multiple |
| Zupa Brukułowa | `Zupa Bru1<ó1owa` | `k→1<`, `ł→1` |
| Zupa z Dyni i Imbiru | `ZUPA Z DYN1 1 1MB1RU` | `I→1` |
| Łazanki ze Śmietaną | `ŁAZANK1 ZE ŚM1ĘTANQ` | `I→1`, `Ą→Q` |
| Żurek z Kielbasą | `ŻUR€K Z KI€LBASĄ` | `E→€` |

These are inherent to the synthetic OCR generation; the extractor cannot fix them. The evaluation harness could apply fuzzy/OCR-tolerant matching (e.g. normalise `0↔O`, `1↔I`, `€↔E`) before scoring.

---

## Pattern C: Content extracted from wrong position in recipe body (10 failures)

The extractor latches on to a salient-looking line deep in the recipe — a section sub-header, ingredient note, or serving instruction — instead of the title. In several cases the input file begins with continuation text from a previous recipe (no title visible near the top).

| Expected | Extracted |
|---|---|
| Grilled Halibut with Lemon Butter | `SERVING SUGGESTION:` |
| Herb Marinated Olives | `SERVING SUGGESTION:` |
| Kopytka z Pieczarkami | `Świeża pietruszka do garniru` |
| Lemon Blueberry Cake | `GLAZE:` |
| Mozzarella and Tomato Sandwich | `Sea salt + Fresh cracked pepper` |
| Oscypek Smażony | `SERVING SUGGESTIONS:` |
| Pan Seared Scallops | `Salt and pepper + Lemon wedges for serving` |
| Sałatka ze Świeżych Warzyw | `INSTRUKCJE:` |
| Śledzie w Śmietanie | `SERVING:` |
| Spinach and Ricotta Ravioli | `For the sauce:` |

For Grilled Halibut and Kopytka, the input starts mid-recipe (previous recipe's instructions), so there is genuinely no title near the top. For the rest the title exists early in the file but the algorithm bypasses it.

---

## Pattern D: Metadata/context lines before title get selected (3 failures)

The title is preceded by multiple lines of structured metadata (season labels, prep times, servings counts, page watermarks). The algorithm picks one of these context lines rather than the actual recipe name.

| Expected | Extracted | Why wrong line |
|---|---|---|
| Chleb Żytni | `Porcji: 4` | Page watermarks on lines 1–2, title on line 3; servings parsed from later |
| Kompot Porzeczkowy | `UWAGI:` | Season / time / servings block on lines 1–3, title on line 5 |
| Lentil Vegetable Soup | `[CLASSIC FALL SOUPS]` | Page number on line 1, title on line 3, category tag on line 5 |

---

## Pattern E: Case normalization not applied (2 failures)

The extractor found the correct line but returns the raw all-caps OCR text instead of normalising to title case.

| Expected | Extracted |
|---|---|
| Minestrone Soup | `MINESTRONE SOUP` |
| Sernik | `SERNIK` |

Note: Minestrone's layout is unusual — `INGREDIENTS` header appears *before* the title line, suggesting the evaluation recipe was designed this way intentionally.

---

## Pattern F: Multi-line title — only second line captured (1 failure)

The title is typeset across two lines (`BARSZCZ` / `UKRAIŃSKI`). The extractor returns only the second line.

| Expected | Extracted |
|---|---|
| Barszcz Ukraiński | `UKRAIŃSKI` |

---

## Pattern G: Subtitle/translation preferred over primary title (1 failure)

The primary title is on line 1; an English translation subtitle follows on line 2. The extractor chose the subtitle.

| Expected | Extracted |
|---|---|
| Karp Pieczony | `Roasted Carp with Almond & Raisin Sauce` |

---

## Pattern H: Compound recipe variant mismatch (3 failures)

Files contain two recipe variants in `A : B` or `A + B` format. The extractor either returns only one half or concatenates section sub-headers instead.

| Expected | Extracted | Issue |
|---|---|---|
| Sourdough Bread with Seeds and Herbs | `SOURDOUGH BREAD WITH SEEDS : SOURDOUGH WITH HERBS` | Full compound returned; expected only first variant |
| Żurawina Kompot : Żurawina z Cukrem | `ŻURAWINA Z CUKREM` | Second variant only; full compound expected |
| Zupa Jarzynowa z Kluskami | `CZĘŚĆ 1: ZUPA / PART 1: SOUP BASE + CZĘŚĆ 2: KLUSKI / PART 2: DUMPLINGS` | Section sub-headers concatenated; title was on line 1 |

---

## Pattern I: Apparent match that still fails — likely encoding/whitespace artifact (3 failures)

Displayed text is identical to expected, but the cases are counted as failures. Likely cause: BOM, NBSP, trailing spaces, or Unicode normalisation differences (e.g. NFC vs NFD for Polish diacritics) not visible in the digest.

| Expected | Extracted |
|---|---|
| Kompot Malinowy | `Kompot Malinowy` |
| Strawberry Shortcake | `Strawberry Shortcake` |
| Vanilla Panna Cotta | `Vanilla Panna Cotta` |

**Fix signal:** Strip and Unicode-normalise (NFC) both strings before comparison.

---

## Summary

| Pattern | Count | Affects real files? |
|---|---|---|
| A — Section header with page number | 7 | No (generated only) |
| B — OCR garbling of correct line | 10 | No (generated simulation) |
| C — Wrong position in recipe body | 10 | Potentially yes |
| D — Metadata lines before title | 3 | Potentially yes |
| E — Case not normalised | 2 | Potentially yes |
| F — Multi-line title, partial capture | 1 | Potentially yes |
| G — Subtitle preferred over title | 1 | Potentially yes |
| H — Compound variant mismatch | 3 | No (generated format) |
| I — Encoding/whitespace artifact | 3 | Potentially yes |

Patterns A, B, and H are specific to generated-file quirks (section headers, digit-substitution OCR noise, explicit multi-variant layouts). Patterns C through G and I can all manifest in real scanned cookbook pages and should be prioritised for the next algorithm iteration.

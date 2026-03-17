# Iteration 26 Failure Analysis

All 16 failures are generated files. 0 real file failures.

---

## Pattern A: Corrupted spillover — title absent from page (5 failures)

**Files:** Baked Cod with Herbs, Bigos Myśliwski, Peach Cobbler, Spinach and Ricotta Pie, Zupa Koperkowa

**What happened:** The page starts with `[CORRUPTED SPILLOVER...]` text from the previous recipe. The actual recipe title either appears much later or not at all. The extractor returns empty string.

**Why:** The extractor finds no candidate title in the early lines and gives up. These are genuinely hard cases — the title may be absent from this page entirely (it was on the previous page).

**Fix direction:** When the file starts with a spillover marker, scan the full document for the first line that looks like a title rather than giving up early. Alternatively, if no title is found, look for the first all-caps line or a line following a blank line that isn't an ingredient/instruction.

---

## Pattern B: OCR digit-for-letter corruption causes empty extraction (2 failures)

**Files:** Braised Cod with White Wine (`Bra1sed Cod w1th Wh1te W1ne`), Roasted Beet and Walnut Dip (`Roasted Beet and Walnut D1p`)

**What happened:** The title is on line 1, but digits have been substituted for letters (1→i, 1→l). The extractor returns empty string despite a plausible title candidate being present.

**Why:** The extractor likely applies a confidence filter or pattern match that rejects heavily digit-corrupted strings. The corruption here is dense enough to disqualify the line entirely.

**Fix direction:** Lower the rejection threshold for digit-corrupted lines when they appear in title position (first non-empty line). A line like `Bra1sed Cod w1th Wh1te W1ne` should still score as a plausible title — it has the right length, capitalization structure, and position.

---

## Pattern C: OCR corruption causes wrong body text extraction (3 failures)

**Files:** Drożdże Sernik (`Drożdże Sern1k` → `Podaw4ć letni lub chłodny.`), Piernik z Śliwkami (`P1ern1k z Śliwkami` → `Podaw4ć ciepło ze śmietaną lub lodami.`), Żurek Krakowski (garbage tokens → `XxYyZz salt and pepper`)

**What happened:** The title exists on line 1 with partial corruption. Instead of extracting it (or returning empty), the extractor picks up a corrupted body text line. For Drożdże/Piernik, it's a serving instruction near the end. For Żurek, it's a garbage token embedded in an ingredient line.

**Why:** The extractor skips the corrupted title candidate and then selects the best-scoring remaining line — which happens to be a short, standalone sentence. The corruption note lines `(OCR CORRUPTION: ...)` may be throwing off line-position heuristics.

**Fix direction:** The extractor should prefer the first non-empty, non-annotation line even when partially corrupted, over any line deeper in the document. A body text line should never outscore a line-1 candidate.

---

## Pattern D: Section/category header precedes title (3 failures)

**Files:** Halibut with Saffron Cream Sauce (`FISH & SEAFOOD` → title on line 3), Roasted Asparagus with Parmesan (`VEGETABLES` → title on line 3), Ogórkowa Zupa (metadata line `Lato | Zupy | DLA 4 OSÓB | PRZYGOTOWANIE 15 MIN | ...` → title on line 3)

**What happened:**
- Halibut: extracted a body sentence (`In same pan, sauté shallots until softened.`) — the section header was probably scored higher than the title, and then the real title was skipped
- Roasted Asparagus: extracted the description line immediately after the title (`Simple yet elegant vegetable dish that complements`)
- Ogórkowa Zupa: extracted empty — the metadata line confused the heuristic

**Why:** The extractor treats all-caps short phrases (`FISH & SEAFOOD`, `VEGETABLES`) as strong title candidates and picks them, missing the actual recipe title on the next non-empty line. For Ogórkowa Zupa, the pipe-delimited metadata line may have been rejected (correctly) but then the actual title `OGÓRKOWA ZUPA` was also rejected or missed.

**Fix direction:**
- Section headers (1-3 words, all-caps) should be deprioritized relative to the line immediately following them
- A line followed by a short description/intro paragraph is a stronger title signal than a standalone all-caps category word
- Pipe-delimited metadata lines should be recognized and skipped, with the next non-empty line promoted

---

## Pattern E: Multi-line title only partially captured (1 failure)

**File:** Lemon Herb Roasted Vegetables (`LEMON HERB RO45TED` / `VEGETABLES` → extracted `LEMON HERB ROASTED`)

**What happened:** The title spans two lines. Only line 1 was extracted (with OCR correction applied: `RO45TED` → `ROASTED`). Line 2 (`VEGETABLES`) was dropped.

**Why:** The extractor correctly normalizes the OCR corruption but treats each line independently. It doesn't detect the continuation pattern (short all-caps first line + single word second line = one title).

**Fix direction:** When a title candidate is unusually short (≤4 words) and the very next line is also all-caps and short, merge them as a single title.

---

## Pattern F: Page starts mid-recipe, no title on page (2 failures)

**Files:** Sweet Potato Salad (starts with ingredient list), Mushroom Risotto (starts mid-recipe continuation)

**What happened:**
- Sweet Potato Salad: extracted an ingredient line (`½ red onion, thinly sliced`) — the page starts directly with ingredients, no title visible
- Mushroom Risotto: extracted the *next* recipe's title (`CARPACCIO DI PESCE SPADA + CARPACCIO WITH CITRUS DRESSING`) — the page continues a previous recipe then starts a new one

**Why:** For Sweet Potato Salad, no title exists in the document so the extractor falls back to a random line. For Mushroom Risotto, the extractor found what looks like a valid title, but it belongs to the *next* recipe on the same page, not the expected one.

**Fix direction:**
- When the page starts with ingredient-list patterns (quantities, fractions, commas), flag it as a mid-recipe continuation and return empty rather than guessing
- On pages with multiple recipe titles, prefer the one nearest the top of the document, not the most prominent-looking one

---

## Summary table

| Pattern | Count | Extractor returns |
|---------|-------|-------------------|
| A. Spillover — title absent | 5 | empty |
| B. Heavy digit corruption — title skipped | 2 | empty |
| C. Partial corruption — wrong body line selected | 3 | wrong body text |
| D. Section header before title | 3 | section header, description line, or empty |
| E. Multi-line title truncated | 1 | first line only |
| F. Mid-recipe page start | 2 | ingredient or next recipe's title |

All failures are generated-file only. No real files affected this iteration.

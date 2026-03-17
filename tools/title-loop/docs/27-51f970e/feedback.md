# Iteration 27 Failure Analysis

All 11 failures are generated files. No real file failures.

---

## Pattern 1: OCR digit-for-letter corruption on title line (5 cases)

**Affected:** Braised Cod with White Wine, Drożdże Sernik, Piernik z Śliwkami, Roasted Beet and Walnut Dip, Żurek Krakowski

The title appears on line 1 but contains OCR corruption (e.g. `Bra1sed`, `Sern1k`, `D1p`, `P1ern1k`). The extractor either:
- Returns empty (Braised Cod, Roasted Beet) — likely rejected the corrupted line as non-title
- Returns a later line (Drożdże → `Podaw4ć letni lub chłodny.`, Piernik → `Podaw4ć ciepło ze śmietaną lub lodami.`, Żurek → `XxYyZz salt and pepper`) — picked garbage/instruction text instead

**Root cause:** The extractor penalizes or skips lines with digit-for-letter substitutions. When it rejects the (corrupted) title line, it either falls back to nothing or picks the next "prominent-looking" line, which may be garbage text injected into the OCR stream.

**Fix direction:** The extractor should tolerate mild digit-for-letter corruption (1→i/l, 4→a, etc.) on an otherwise title-shaped line, especially when it appears first.

---

## Pattern 2: Category/section header precedes the title (3 cases)

**Affected:** Halibut with Saffron Cream Sauce, Roasted Asparagus with Parmesan, Ogórkowa Zupa

The real title is on line 2 or 3, preceded by a section header (`FISH & SEAFOOD`, `VEGETABLES`) or a metadata line (`Lato | Zupy | DLA 4 OSÓB | PRZYGOTOWANIE 15 MIN | ...`). The extractor:
- Skips past the header correctly but then picks the subtitle/description instead of the title (Halibut → instruction body; Roasted Asparagus → description sentence)
- Returns empty (Ogórkowa Zupa) — the metadata line may have confused position logic

**Root cause:** After skipping a section header, the extractor doesn't reliably land on the next line as the title. For the pipe-separated metadata case, it may not recognise the pattern as "skip this" at all.

**Fix direction:** After identifying and skipping a section header or metadata line, the immediately following line should be treated as the title candidate. Pipe-separated metadata lines (`word | word | ...`) should be recognized as non-title and skipped.

---

## Pattern 3: Multi-line split title (1 case)

**Affected:** Lemon Herb Roasted Vegetables

The title is split across two lines due to page layout: `LEMON HERB RO45TED` / `VEGETABLES`. The extractor returned only the first fragment (`LEMON HERB ROASTED`), missing the continuation.

**Root cause:** The extractor treats each line independently and stops at the first "title-shaped" line. It doesn't check whether the following line could be a title continuation (short, all-caps, no verb/punctuation).

**Fix direction:** If a candidate title line is short and the next line is also short and all-caps (or title-cased) with no sentence-ending punctuation, concatenate them as a single title.

---

## Pattern 4: Previous-page content before the title (2 cases)

**Affected:** Mushroom Risotto, Peach Cobbler

The file starts with content from the end of a previous recipe (cooking instructions, ingredient continuations). The actual recipe title (`Mushroom Risotto`, `Peach Cobbler`) is buried later in the file. The extractor returned:
- `CARPACCIO DI PESCE SPADA` (a different recipe's title that appeared mid-file)
- `Assembly: 1. Preheat oven to 375°F (I90°C)` (an instruction line)

**Root cause:** When the beginning of the file is clearly mid-recipe content, the extractor should scan forward. But it either picks the first all-caps/bold-looking line it finds (which is a different recipe's title in the Mushroom Risotto case) or a random instruction line.

**Fix direction:** Presence of a `[CORRUPTED TEXT FROM PREVIOUS PAGE]` marker or mid-instruction opening lines should trigger a forward scan for the first standalone title-shaped line, ignoring embedded titles from adjacent recipes.

---

## Summary table

| Pattern | Count | Real files | Generated files |
|---|---|---|---|
| OCR digit-for-letter on title line | 5 | 0 | 5 |
| Category header / metadata before title | 3 | 0 | 3 |
| Multi-line split title | 1 | 0 | 1 |
| Previous-page content before title | 2 | 0 | 2 |
| **Total** | **11** | **0** | **11** |

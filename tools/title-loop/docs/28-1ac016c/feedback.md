# Iteration 28 Failure Analysis

All 11 failures are on generated files. No real-file failures this iteration.

---

## Pattern 1: OCR digit-for-letter corruption in first-line title (5 failures)

**Files:** Braised Cod with White Wine, Roasted Beet and Walnut Dip, Drożdże Sernik, Piernik z Śliwkami, Żurek Krakowski

The title appears as the very first line but contains OCR substitutions (e.g. `1` for `i`/`l`, `¡` for `i`). Line 2 is always a parenthetical corruption note, and line 5 is `lngredients:` (itself corrupted).

**What was extracted vs expected:**
- Braised Cod, Roasted Beet → extracted nothing (empty)
- Drożdże Sernik, Piernik z Śliwkami → extracted a closing serving suggestion from the body
- Żurek Krakowski → extracted garbage tokens (`XxYyZz salt and pepper`)

**Why:** The extractor apparently rejects the first line when it contains digit-substitution corruption, then falls through to pick an arbitrary body line. The inconsistency (empty vs wrong line) suggests the fallback logic is non-deterministic or position-based rather than semantic.

**Fix direction:** Apply fuzzy/normalized matching on the first line — strip digits that look like letters (1→i, 0→o) before confidence scoring, or explicitly prefer the first non-empty line even when OCR confidence is low.

---

## Pattern 2: Section/category header precedes the real title (3 failures)

**Files:** Halibut with Saffron Cream Sauce, Roasted Asparagus with Parmesan, Ogórkowa Zupa

The true title is not on line 1. Instead:
- Halibut / Roasted Asparagus: Line 1 is an ALL-CAPS category header (`FISH & SEAFOOD`, `VEGETABLES`), line 3 is the recipe title.
- Ogórkowa Zupa: Line 1 is a pipe-separated metadata string (`Lato | Zupy | DLA 4 OSÓB | PRZYGOTOWANIE 15 MIN | GOTOWANIE 20 MIN`), line 3 is the ALL-CAPS title `OGÓRKOWA ZUPA`.

**What was extracted vs expected:**
- Halibut → extracted a mid-document instruction line
- Roasted Asparagus → extracted the subtitle/description line immediately after the title
- Ogórkowa Zupa → extracted nothing (empty)

**Why:** The extractor treats line 1 as the title candidate. When line 1 is rejected (it's a category header or metadata), the fallback doesn't correctly skip to the next title-like line. For Roasted Asparagus, the description line was promoted because it immediately follows the title and may score higher. For Ogórkowa Zupa, the ALL-CAPS title on line 3 wasn't recognized (possibly filtered as noise or confused with a header).

**Fix direction:** Add a skip-list for common non-title first-line patterns: ALL-CAPS single-category words, pipe-delimited metadata strings. After skipping, treat the next short standalone line as the title candidate. ALL-CAPS multi-word lines that look like recipe names should be accepted, not filtered.

---

## Pattern 3: Title absent from the document beginning (2 failures)

**Files:** Mushroom Risotto, Peach Cobbler

The file begins mid-recipe — either a continuation from a previous page or a section break — so the actual recipe title never appears near the top.

**What was extracted vs expected:**
- Mushroom Risotto → extracted `CARPACCIO DI PESCE SPADA` (a different recipe title appearing later in the same document)
- Peach Cobbler → extracted `Assembly: 1. Preheat oven to 375°F (I90°C)` (an instruction line)

**Why:** When the true title isn't present at the start, the extractor latches onto the first prominent-looking string it finds anywhere in the document. For Mushroom Risotto, that happened to be another recipe's ALL-CAPS title. For Peach Cobbler, it found an instruction with a capital word.

**Fix direction:** These are inherently ambiguous inputs. A reasonable heuristic: if the first 3 lines contain `[CORRUPTED TEXT FROM PREVIOUS PAGE]` or similar continuation markers, signal low confidence and return empty rather than a wrong answer. For the Mushroom Risotto case (no corruption marker), the challenge is harder — the extractor needs to know that a title mid-document doesn't belong to this recipe.

---

## Pattern 4: Mixed-case OCR corruption in title (1 failure)

**File:** Kopytka z Pieczarkami Leśnymi

The title on line 1 is `KoPyTka z P¡eczarkami Leśnymi` — erratic capitalization plus a dotless `¡` substitution for `i`.

**What was extracted vs expected:**
- Extracted: `Ugotuj ziemniaky. (38)` (a cooking step)
- Expected: `Kopytka z Pieczarkami Leśnymi`

**Why:** The random capitalization pattern may cause the extractor to score line 1 as non-title (it doesn't match a typical title-case or ALL-CAPS pattern). It then falls through to a body line.

**Fix direction:** Normalize candidate lines to title-case before pattern-matching. Erratic casing on an otherwise short, non-punctuated first line should still be treated as a title candidate.

---

## Summary table

| Pattern | Count | Extractor behavior | Affects real files? |
|---|---|---|---|
| OCR digit substitution in first-line title | 5 | Empty or random body line | Not observed yet |
| Category header / metadata before title | 3 | Wrong line or empty | Likely (cookbooks with headers) |
| Title absent from document start | 2 | Different recipe name or instruction | Likely (multi-page scans) |
| Mixed-case OCR corruption | 1 | Body line | Possible |

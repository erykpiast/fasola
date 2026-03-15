# Title Extraction Feedback — Commit 404c596

## Per-Failure Analysis

### 1. ARAYES SHRAK
- **Expected:** `ARAYES SHRAK`
- **Got:** `pepper + MAKES 8 ARAYES`
- **Root cause:** The title is split across two short lines (`ARAYES` / `SHRAK`, 6 and 5 chars each). The `findBurstEnd` function skips initial runs of lines shorter than 20 chars. Lines 1–2 are the title but are only 6 and 5 chars long. However, there are only 2 short lines before a longer one, so `findBurstEnd` returns 0 (needs ≥3 to trigger). The real problem is that the 2-line join `ARAYES SHRAK` (12 chars) passes hard filters and *should* be a candidate. It likely loses the embedding scoring to `pepper` (a short standalone word from a broken ingredient line) and `MAKES 8 ARAYES` (which contains the word ARAYES and looks title-like). The algorithm picks up fragments from the ingredient/instruction body that happen to contain the recipe name as a substring, rather than recognizing the title at position 0.

### 2. Baked Eggs with Feta, Harissa Tomato Sauce & Coriander
- **Expected:** `Baked Eggs with Feta, Harissa Tomato Sauce & Coriander`
- **Got:** `Baked Eggs with Feta, Harissa Tomato Sauce + SERVES *`
- **Root cause:** The title spans two OCR lines: `Baked Eggs with Feta, Harissa Tomato Sauce` (line 1) and `& Coriander` (line 2). The 2-line join combines line 1 + line 2, producing `Baked Eggs with Feta, Harissa Tomato Sauce & Coriander` — the correct title. But the algorithm also builds other multi-line joins. `SERVES *` (line 4) is a short ALL_CAPS line that scores as a separate candidate. The final output joins the best-scoring candidates with ` + `, so the result includes `SERVES *` as a second "title". The deduplication logic (lines 213–221) only removes candidates where one is a *substring* of another — `SERVES *` is not a substring of the title, so it survives. **The core issue: `SERVES *` is metadata (serving count), not a title, but there's no filter for recipe metadata lines like `SERVES`, `MAKES`, `YIELD`, `PREP TIME`, etc.**

### 3. FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS
- **Expected:** `FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS`
- **Got:** `DAT FLATBREADS + butter + ng sheet with baking`
- **Root cause:** This is a two-recipe page with severe OCR corruption at the top. The OCR text starts with garbled fragments (`2 (/½ cup plus ı tablespoon a sland mixer...`). The actual recipe titles (`FINNISH MILK FLATBREADS` at line 16, `FINNISH POTATO FLATBREADS` at line 29) appear mid-document. The algorithm finds candidates but the OCR-corrupted fragments (`DAT FLATBREADS` — a garbled version of a heading) score higher or appear first. The fragment `ng sheet with baking` is an ingredient-context line that passes filters because it doesn't contain measurement units. **Two issues: (1) no OCR quality/confidence filtering — garbled text with unusual character sequences should be penalized; (2) the algorithm doesn't recognize that recipe titles on multi-recipe pages tend to be ALL_CAPS headings that appear as distinct structural elements.**

### 4. OVERNIGHT STRAIGHT PIZZA DOUGH
- **Expected:** `OVERNIGHT STRAIGHT PIZZA DOUGH`
- **Got:** `or anytime over the next 2 days. + Fine sea salt`
- **Root cause:** The title `OVERNIGHT STRAIGHT PIZZA DOUGH` is line 1 (30 chars, ALL_CAPS). It passes hard filters and should be a strong candidate. But the algorithm returned completely unrelated text. `or anytime over the next 2 days.` is a sentence fragment from the schedule section (line 7). `Fine sea salt` is an ingredient (line 21) — it passes the ingredient filter because "salt" alone isn't in `MEASUREMENT_PATTERNS` (only units like "cup", "tbsp" are checked, not ingredient names). **The embedding scoring is the likely culprit: the title reference phrase `"recipe name, dish title, name of the food"` apparently has higher cosine similarity with generic food-related phrases than with `OVERNIGHT STRAIGHT PIZZA DOUGH`, which sounds more like a technique description.** The title's semantic content (a dough-making method) may not embed close to the reference "dish title" concept.

### 5. SAFFRON WHEAT BUNS WITH QUARK : COTTAGE CHEESE (VARIATION D)
- **Expected:** `SAFFRON WHEAT BUNS WITH QUARK : COTTAGE CHEESE (VARIATION D)`
- **Got:** `ssekart + The + favoured by`
- **Root cause:** Severe OCR quality issues. The input text is heavily garbled at the top — `ssekart`, `alled out into names.`, `The`, `favoured by` are all OCR fragments. The actual title appears at lines 54–55 as `SAFFRON WHEAT BUNS WITH QUARK` / `/ COTTAGE CHEESE (VARIATION D)`. The 2-line join would produce `SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)` (58 chars) — this passes the 80-char max filter. But the title is buried deep in the document (line 54 of 76), and the garbled short fragments at the top dominate the candidate list. `ssekart`, `The`, and `favoured by` are all short strings that pass hard filters (≥3 chars, ≤80 chars, no measurements, no leading numbers). **The algorithm has no mechanism to penalize obviously garbled OCR text (random lowercase fragments, orphaned words like "The").**

## Common Themes

### 1. No recipe metadata filtering
Lines like `SERVES *`, `MAKES 8 ARAYES`, `PREP TIME`, `BULK FERMENTATION` are recipe metadata — not titles. The hard filters only check for measurements and leading numbers. A blocklist or pattern for common recipe metadata keywords (`SERVES`, `MAKES`, `YIELD`, `PREP TIME`, `PROOF TIME`, `SAMPLE SCHEDULE`) would eliminate several false positives.

### 2. No OCR quality gate
Garbled OCR fragments (`ssekart`, `DAT FLATBREADS`, `ng sheet with baking`) pass all filters because they're syntactically valid short strings. The algorithm needs a way to detect low-quality OCR output — e.g., checking for unusual character bigrams, high consonant-to-vowel ratios, or very short orphaned words that aren't common English words.

### 3. Embedding scoring doesn't reliably distinguish titles from body text
The semantic reference `"recipe name, dish title, name of the food"` doesn't consistently score actual titles highest. Technique-oriented titles (`OVERNIGHT STRAIGHT PIZZA DOUGH`) and multi-word titles with qualifiers (`SAFFRON WHEAT BUNS WITH QUARK`) may embed further from the reference than short food-related phrases in the body. The embedding approach needs either better reference phrases or additional signals beyond pure semantic similarity.

### 4. Position signal is underweighted
Recipe titles almost always appear at or near the top of the text. The algorithm uses position only as a tiebreaker for sorting (line 224), not as a scoring factor. A position bonus — especially for the first non-garbled line or the first ALL_CAPS line — would significantly help. In 4 of 5 failures, the correct title was within the first 2 lines or was the first ALL_CAPS heading.

### 5. Multi-line title joining is fragile
Titles split across OCR lines (e.g., `ARAYES` / `SHRAK`, or `Baked Eggs...` / `& Coriander`) rely on the 2–3 line join mechanism. This works mechanically but the joined candidate competes on equal footing with every other 2–3 line join in the document. There's no signal that a join at position 0 of two short ALL_CAPS lines is more likely a split title than a join of two random body-text lines at position 40.

### 6. The `+`-join output format creates ambiguity
The algorithm joins multiple selected candidates with ` + `. This means the output conflates multi-part titles (which legitimately contain `+`) with multi-candidate results. There's no way to distinguish "two recipes on one page" from "title + spurious match".

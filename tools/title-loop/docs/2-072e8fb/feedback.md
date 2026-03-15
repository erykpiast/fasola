# Iteration 2 — Title Extraction Failure Analysis

## Per-failure analysis

### 1. ARAYES SHRAK → extracted "ARAYES"

**Input structure:** The title is split across two lines: "ARAYES" (line 1) and "SHRAK" (line 2).

**Why it failed:** `buildCandidates` does generate 2-line joins, so "ARAYES SHRAK" was a candidate. However, the deduplication logic at line 281–289 removes any candidate whose text *contains* a shorter candidate. "ARAYES SHRAK" contains "ARAYES", and "ARAYES" is shorter, so the joined candidate is discarded in favour of the single-word fragment. The dedup filter is backwards for this case — it should prefer the longer, more complete title, not the shorter substring.

### 2. Baked Eggs with Feta, Harissa Tomato Sauce & Coriander → extracted with spurious " + "

**Input structure:** Title spans two lines: "Baked Eggs with Feta, Harissa Tomato Sauce" and "& Coriander".

**Why it failed:** Two candidates survived scoring: the single-line "Baked Eggs with Feta, Harissa Tomato Sauce" and the 2-line join "Baked Eggs with Feta, Harissa Tomato Sauce & Coriander". Neither is ALL_CAPS, so the multi-title guard's zero-ALL_CAPS branch fires, keeping all survivors and joining them with " + ". The result is the full title concatenated with its own first line: `"Baked Eggs with Feta, Harissa Tomato Sauce + & Coriander"`. The dedup filter should have caught this (the shorter is a substring of the longer), but apparently both survived because the join was done with " + " as a separator, not as a substring check artefact — it's actually the multi-title join at line 313 producing `selected[0].text + " + " + selected[1].text` where selected contains both the partial and full title. The substring dedup *did* remove the longer one (same bug as #1), leaving both the partial line and "& Coriander" as separate survivors.

### 3. FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS → extracted "DAT FLATBREADS"

**Input structure:** This is a multi-recipe page. The OCR text is heavily corrupted in the first half (truncated left edge). The actual recipe titles "FINNISH MILK FLATBREADS" (line 16) and "FINNISH POTATO FLATBREADS" (line 29) appear in the middle and lower portions of the text. Near the top, the garbled fragment "DAT FLATBREADS" (line 4) appears — this is an OCR corruption of a different heading.

**Why it failed:** Two factors conspire:
1. **Position bonus:** "DAT FLATBREADS" is at line 4 (very early), earning a large position bonus (~0.14). The real titles at lines 16 and 29 get smaller or zero position bonuses.
2. **`isLikelyGarbled` doesn't catch it:** "DAT FLATBREADS" has 3+ letters, acceptable vowel ratio, multiple words, and starts with uppercase — it passes all garble checks despite being OCR noise.
3. **ALL_CAPS bonus:** "DAT FLATBREADS" gets the ALL_CAPS bonus, same as the real titles, so it doesn't lose on that axis.

The position bonus overwhelms the semantic signal, and there's no validation that the candidate text forms recognisable words.

### 4. MIXED SEED CRISPBREAD → extracted "sheet in to heat up. arge bowl and mix"

**Input structure:** The OCR text has severe left-edge truncation throughout the first half. The actual title "MIXED SEED CRISPBREAD" appears at line 18, well into the second half of the text. The first ~17 lines are garbled fragments from a preceding recipe.

**Why it failed:**
1. **`isLikelyGarbled` misses sentence fragments:** The extracted text "sheet in to heat up. arge bowl and mix" passes the garble filter — it has normal vowel ratio, multiple words, and sufficient length (>24 chars, so the lowercase-start heuristic at line 100 doesn't apply).
2. **Position bonus:** This fragment appears early in the document, getting a large position bonus that outweighs the semantic similarity of the real title.
3. **The real title at line 18** is past the halfway point of 34 lines, so it gets zero position bonus, and must win on semantic score alone — which apparently wasn't enough to overcome the position-boosted garbage.

### 5. SAFFRON WHEAT BUNS WITH QUARK : COTTAGE CHEESE (VARIATION D) → extracted "BUNS ssekart + ..."

**Input structure:** This is a multi-recipe page. The first ~28 lines contain heavily corrupted OCR from a preceding recipe. The target title spans lines 54–55: "SAFFRON WHEAT BUNS WITH QUARK" and "/ COTTAGE CHEESE (VARIATION D)". "BUNS" appears as a standalone garbled fragment on line 1.

**Why it failed:**
1. **"BUNS" is in `NON_TITLE_WORDS`** (line 57) but only as a *single-word* filter. When "BUNS" gets joined with adjacent garbled lines (e.g., "BUNS ssekart"), it passes the single-word check and becomes a multi-word candidate.
2. **Position bonus:** The garbled "BUNS" + neighbours are at position 0–2, earning maximum position bonus.
3. **The real title** is at lines 54–55, deep in the second half — zero position bonus.
4. **The real title is 60 characters** ("SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)") — within the 80-char limit but long enough to be at a disadvantage vs. short candidates in prioritization.

## Common themes

### Theme 1: Substring deduplication is inverted
The dedup filter (lines 281–289) keeps the *shorter* candidate when one is a substring of the other. For multi-line titles where both the partial first line and the full joined title are candidates, this discards the correct (longer) title in favour of an incomplete fragment. The filter should keep the *longer* candidate — the more complete title — not the shorter substring.

### Theme 2: Position bonus dominates over semantic signal
The +0.15 position bonus is large enough to override semantic similarity scores. When OCR corruption puts garbled text before the real title, the garbled text wins purely on position. This is especially problematic for:
- Pages where the title appears in the middle/lower half (common in cookbook scans where a preceding recipe's text bleeds in)
- Multi-recipe pages where the second recipe's title is always in the lower half

### Theme 3: Garble detection is too permissive
`isLikelyGarbled` uses vowel ratio and word length but doesn't check whether words are actual dictionary words. Truncated OCR fragments like "DAT FLATBREADS", "ssekart", and "arge bowl and mix" pass all checks because they happen to have normal vowel ratios and sufficient length. The lowercase-start filter only triggers for lines under 25 characters, so longer garbled fragments slip through.

### Theme 4: Multi-line title joining is fragile
The 2-line and 3-line join strategy works mechanically but the downstream scoring and dedup logic doesn't properly handle the relationship between a joined candidate and its constituent single-line candidates. This causes either the wrong fragment to win (Theme 1) or both to survive and get concatenated with " + " (failure #2).

## Suggested priorities for next iteration

1. **Fix substring dedup** to prefer the longer (more complete) candidate — this directly fixes failures #1 and #2.
2. **Reduce or restructure position bonus** — consider making it a tiebreaker rather than an additive bonus, or cap it at a smaller value (e.g., 0.05). This addresses failures #3, #4, #5.
3. **Strengthen garble detection** — add a check for minimum average word length or a basic dictionary lookup for at least one "real" word in the candidate. This addresses failures #3, #4, #5.

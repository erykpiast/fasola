# Iteration 6 Failure Analysis

## Failures

### 1. `Baked Eggs with Feta, Harissa Tomato Sauce & Coriander` → (unknown, result: no)

**Input structure:**
```
Line 1: Baked Eggs with Feta, Harissa Tomato Sauce
Line 2: & Coriander
Line 3: Baked eggs is one of my all-time... (body, >80 chars, filtered)
```

**Why it still fails after iteration 6's fix:**

Iteration 6 added the `survivingJoins` continuation protection (lines 394–406) to remove the single-line prefix `Baked Eggs with Feta, Harissa Tomato Sauce` when the 2-line join `Baked Eggs with Feta, Harissa Tomato Sauce & Coriander` also survives. This correctly removes the prefix single.

However, `& Coriander` (line 2, the *suffix* fragment) is itself a standalone candidate. It passes every hard filter:
- Length 11 ✓
- No measurement pattern ✓
- Starts with `&` (not lowercase) → not caught by `isLikelyGarbled` ✓
- Two words, so single-word NON_TITLE_WORDS check doesn't apply ✓

If `& Coriander` passes the score threshold and remains in `selected`, the deduplication step (lines 413–421) removes the full join, because:
```
"baked eggs with feta, harissa tomato sauce & coriander".includes("& coriander") → true
```
`& Coriander` is shorter → the join is eliminated. The output becomes `& Coriander` or nothing if `& Coriander` also fails other checks.

**Root cause:** The continuation protection removes the PREFIX single, but not the SUFFIX single (`& Coriander`). The dedup "shorter wins" rule then kills the 2-line join via the unprotected suffix fragment.

**Secondary possible cause:** Even if `& Coriander` falls below threshold, the 2-line join `Baked Eggs with Feta, Harissa Tomato Sauce & Coriander` (no ALL_CAPS, no structural bonus) may score significantly lower than the single-line prefix (without the diluting `& Coriander` phrase appended). If `bestThresholdScore × 0.7` exceeds the join's rawScore, the join is filtered before dedup even runs, leaving only the shorter prefix — which is still not the expected title.

---

### 2. `SAFFRON WHEAT BUNS WITH QUARK : COTTAGE CHEESE (VARIATION D)` → (unknown, result: no)

**Input structure:**
```
Line 1:  BUNS                              ← filtered by NON_TITLE_WORDS
Lines 2–13: garbled fragments              ← filtered by isLikelyGarbled
Line 29: FRON WHEAT BUNS (VARIATION 1)    ← garbled structural heading
Lines 30–53: recipe body, ingredients
Line 54: SAFFRON WHEAT BUNS WITH QUARK    ← correct title line 1
Line 55: / COTTAGE CHEESE (VARIATION D)   ← correct title line 2
```

**Issue A: OCR character corruption (`:` → `/`)**

The expected title (from filename) is:
```
SAFFRON WHEAT BUNS WITH QUARK : COTTAGE CHEESE (VARIATION D)
```

But the OCR text line 55 reads:
```
/ COTTAGE CHEESE (VARIATION D)
```

The `:` separator was OCR'd (or rendered in the file) as `/`. Filenames cannot contain `/` on most filesystems, so the expected title was saved with `:` as a substitute. The algorithm correctly joins lines 54–55 into `SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)`, but the `titles_match` function performs an exact substring comparison: `"saffron wheat buns with quark : cottage cheese (variation d)"` is not contained in `"saffron wheat buns with quark / cottage cheese (variation d)"`. The match fails regardless of whether the algorithm's heuristic logic is correct.

**Issue B: Truncation penalty may be insufficient**

Iteration 6 added a `-0.15` rawScore penalty to structural headings whose significant words are proper suffixes of another structural heading's words (`FRON` ← `SAFFRON`). This was designed to demote `FRON WHEAT BUNS (VARIATION 1)` below the threshold.

However, the penalty is a fixed value and may not be sufficient depending on embedding scores. If `FRON WHEAT BUNS (VARIATION 1)` has a high rawScore (e.g. 0.40), after penalty it becomes 0.25. Its thresholdScore = 0.33. If the correct join (`SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)`) scores lower (e.g. 0.38), its bestThresholdScore = 0.46, threshold = 0.322. In this scenario, FRON's thresholdScore 0.33 still exceeds threshold 0.322 — FRON survives.

If FRON and the correct join both survive, the multi-title guard keeps both (two ALL_CAPS candidates). Output becomes `FRON WHEAT BUNS (VARIATION 1) + SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)` — wrong on two counts.

**Root cause (primary):** The OCR text has `/` but the expected title has `:` (a filesystem substitution artifact). Any algorithm output from this text will contain `/`, never matching the expected `:` substring.

**Root cause (secondary):** The fixed `-0.15` truncation penalty may not reliably demote garbled structural headings across varying embedding score distributions.

---

## Common Themes

### Theme 1: Suffix fragments survive and kill correct joins via dedup (case 1)

The continuation protection (iteration 6) only removes the *prefix* single (`Baked Eggs with Feta, Harissa Tomato Sauce`) when the join survives. It does not remove the *suffix* single (`& Coriander`). The dedup "shorter wins" rule then removes the join because `& coriander` is a substring of it and shorter. Fixing the prefix-side while ignoring the suffix-side is incomplete.

### Theme 2: OCR-to-filename character substitution causes evaluation mismatch (case 2)

The file naming convention encodes `:` in place of `/` (since `/` is illegal in filenames). When the OCR text uses `/` as a structural separator, the algorithm's output will always differ from the expected title by one character. This is a data/evaluation issue, not an algorithm issue. The algorithm may actually be extracting the correct structural heading from the OCR text but failing the match because of this encoding mismatch.

To fix: either normalize `/` ↔ `:` in `titles_match`, or rename the input file with `÷` or another character, or treat `/` and `:` as equivalent separators when comparing.

### Theme 3: Fixed-value penalties on embedding scores are fragile (case 2)

The `-0.15` truncation penalty is an empirically chosen constant applied to a floating-point embedding score. Because embedding scores vary across texts, a fixed penalty can eliminate the garbled candidate in some cases but fail in others. A more robust approach would be relative penalization, disqualification (set rawScore to a large negative), or using a rule-based pre-filter to block clearly garbled structural headings before the scoring phase.

### Theme 4: "Shorter wins" dedup interacts badly with split titles (cases 1 and 2, persistent)

The dedup rule (keep shorter) is correct for ingredient run-ons but wrong for multi-line titles where both halves of the title independently pass hard filters and threshold. The continuation protection added in iteration 6 addresses one direction (prefix removal) but not both directions. The suffix fragment can still trigger the "shorter wins" rule against the correct join.

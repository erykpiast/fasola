# Iteration 14 Failure Analysis

## Failure 1: LABANEH BALLS WITH NIGELLA SEEDS
**Expected:** `LABANEH BALLS WITH NIGELLA SEEDS`
**Got:** `WITH NIGELLA + SEEDS`

### What happened

The true title is spread across 4 lines in the OCR output:
```
LABANEH
BALLS
WITH NIGELLA
SEEDS
```

The algorithm generates joins up to **3 consecutive lines**, so `LABANEH BALLS WITH NIGELLA` (3-line join, position 0) is the longest candidate that captures the start of the title. The full 4-word title `LABANEH BALLS WITH NIGELLA SEEDS` is never in the candidate pool.

With the full title absent, `LABANEH BALLS WITH NIGELLA` (3-line) competes against `WITH NIGELLA` (single, position 2) and `WITH NIGELLA SEEDS` (2-line, position 2). All three are structural headings.

The dedup step then eliminates `LABANEH BALLS WITH NIGELLA` because it **contains** `WITH NIGELLA` as a substring, and the dedup rule is "shorter wins":
```
aLower.includes(b.text.toLowerCase()) && b.text.length < a.text.length
  → removes "LABANEH BALLS WITH NIGELLA" (contains "with nigella", shorter)
```

The structural heading prefix-removal guard (`fshLower.startsWith(sLower + " ")`) does not help here because `WITH NIGELLA` is a **suffix** of `LABANEH BALLS WITH NIGELLA`, not a prefix — so it is not stripped before dedup runs.

After dedup, `WITH NIGELLA` and `SEEDS` remain. Both are all-caps. The multi-title guard checks whether the second candidate (`SEEDS`, position 3) is followed by ingredient-like lines — it is not (body text follows) — so `isSubHeader = false` and both survive. Result: `WITH NIGELLA + SEEDS`.

### Root causes
1. **3-line join ceiling**: a 4-line title is never formed as a candidate.
2. **Dedup "shorter wins" removes valid longer candidate**: `WITH NIGELLA` is a semantic fragment of the title but dedup treats it as more authoritative than the longer join it partially overlaps.

---

## Failure 2: Smażona zielona fasolka
**Expected:** `Smażona zielona fasolka`
**Got:** `GREEN BEANS BORKEUM`

### What happened

The OCR text opens with three title variants:
```
Line 0: Smażona zielona fasolka   (Polish, mixed-case — true title)
Line 1: GREEN BEANS BORKEUM       (English + Korean romanization, all-caps)
Line 2: 그린빈 볶음                 (Korean script — filtered by garbled check)
```

`Smażona zielona fasolka` is mixed-case (Polish capitalizes only the first word of a title). It never qualifies as a structural heading (`isAllCaps` strips non-ASCII letters, checks only `[a-zA-Z]`, and `Smażona` contains lowercase ASCII letters).

`GREEN BEANS BORKEUM` is all-caps with 3 words each ≥4 letters → it is a structural heading and receives the +0.10 structural bonus, pushing it above the mixed-case Polish title.

The bilingual-title detection is the intended guard: it looks for a mixed-case candidate at position 0 and a nearby all-caps candidate (position 1–2) with cosine similarity > 0.4. If triggered, it suppresses the all-caps candidate from `scoredForThreshold` (and thus from `selected`).

The guard did **not** trigger here. The Polish phrase `Smażona zielona fasolka` and the English+Korean romanization `GREEN BEANS BORKEUM` are semantically equivalent (both mean "stir-fried green beans"), but the embedding similarity falls at or below 0.4. Cross-lingual pairs where one language uses completely different script/word roots (Polish vs. Korean romanization) produce lower cosine similarity than bilingual pairs in related European languages.

### Root causes
1. **Structural bonus overrides true title**: an all-caps secondary title line wins purely because of the +0.10 structural heading bonus, which mixed-case legitimate titles cannot receive.
2. **Bilingual detection threshold too strict for cross-linguistic pairs**: 0.4 cosine similarity is not reliably met when Polish and Korean romanization embeddings diverge despite shared meaning.

---

## Common Themes

### 1. All-caps structural heading bias is too strong
The +0.10 structural bonus is enough to flip the winner when the true title is mixed-case (Polish, Italian, etc. capitalization conventions). Recipes in non-English cookbooks often have mixed-case titles on the first line, followed by an all-caps translation or subtitle.

### 2. Candidate pool limited to 3-line joins
Titles split across 4+ lines cannot be assembled. This is uncommon but occurs here because the OCR broke `LABANEH BALLS WITH NIGELLA SEEDS` into four one-to-two-word lines. The algorithm's pre-merge step only handles lines starting with a continuation character (`/&+:(`), so ordinary word splits across lines are not handled beyond 3.

### 3. Dedup "shorter wins" can destroy the best candidate
The rule is correct for `Pierogi Ruskie` vs `Pierogi Ruskie 200g mąki` but breaks down when a shorter overlapping substring is a fragment of the title rather than a more focused title. `WITH NIGELLA` is not a recipe title — it is an OCR fragment — yet it causes the 3-line join to be eliminated.

### 4. Cross-lingual bilingual detection is fragile
The 0.4 similarity threshold works for closely related language pairs (e.g. Polish + English, French + English) but is too high for pairs like Polish + Korean romanization. The detection also only looks at position 0 (mixed-case) + positions 1–2 (all-caps). If the all-caps translation appears later, or the Polish title is itself at position 1, the guard does not fire.

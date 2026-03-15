# Iteration 10 Failure Analysis

## Failure 1: CHLEBEK Z WARZYWAMI I BOCZKIEM

**Input structure (key lines):**
```
idx 0:  Lato | Dania główne
idx 1:  CHLEBEK Z WARZYWAMI I BOCZKIEM        ← actual title (6 words)
idx 2:  WARZYWA I BOCZEK                       ← section header
idx 3:  500 g strączków zielonego groszku      ← ingredient
...
idx 8:  CHLEBEK                                ← section header (bread)
idx 9:  500 g mąki                             ← ingredient
...
idx 14: DLA 4 OSÓB                             ← metadata
idx 15: PRZYGOTOWANIE 1 GODZ. 45 MIN           ← metadata
idx 16: GOTOWANIE 30 MIN                       ← metadata
idx 17: OCZEKIWANIE 1 GODZ. 30 MIN             ← metadata
```

**Root cause: 25-candidate pre-filter cuts the actual title**

This document has many short all-caps section headers that survive `passesHardFilters`:
- "WARZYWA I BOCZEK" (3 words)
- "CHLEBEK" (1 word)
- "DLA 4 OSÓB" (3 words)
- "PRZYGOTOWANIE 1 GODZ. 45 MIN" (4 words — Polish, not caught by `looksLikeMetadata`)
- "GOTOWANIE 30 MIN" (3 words)
- "OCZEKIWANIE 1 GODZ. 30 MIN" (4 words)

With 36 lines generating ~30+ candidates (single + 2-line + 3-line joins), the pre-filter at line 241 kicks in. It sorts all-caps candidates with `wordCount <= 5` before those with `wordCount > 5`. "CHLEBEK Z WARZYWAMI I BOCZKIEM" has **6 words** — it is the only long all-caps candidate and gets ranked last among all-caps items. When the pool is sliced to 25, it is cut.

With "CHLEBEK Z WARZYWAMI I BOCZKIEM" absent from the candidate pool:
- It is never embedded and never enters `structuralCandidates`
- `firstStructuralHeading` resolves to something else (likely "WARZYWA I BOCZEK")
- The prefix filter at line 440 (which would have removed "CHLEBEK" as a prefix of the full title) never fires
- "CHLEBEK" (1 word, all-caps, early-ish position) wins as the top-scoring structural or all-caps candidate

The prefix filter at line 440 is a correct fix but it is contingent on the full title being present in `selected`. It cannot fire when the full title was cut before embedding. The 25-candidate cap with "short first" sorting is what causes the full title to disappear.

---

## Failure 2: Faszerowana papryka

**Input structure (key lines):**
```
idx 0:  Faszerowana papryka          ← actual title (mixed case)
idx 1:  PAPRIKA GYERAN-JJIM          ← Korean romanization
idx 2:  파프리카 계란찜                ← Korean script (filtered as garbled)
idx 3-4: body text
idx 5:  NA 3 PAPRYKI                 ← serving size: "FOR 3 PEPPERS" (Polish)
idx 6:  Przygotowanie
...
idx 9:  SKŁADNIKI
```

**Root cause: Polish serving-size pattern not covered by `looksLikeMetadata`**

"NA 3 PAPRYKI" means "FOR 3 PEPPERS" in Polish — a serving-size line equivalent to "SERVES 3". It passes **all** hard filters:
- Length 10, within 3–80 range ✓
- No measurement units from `MEASUREMENT_PATTERNS` ✓
- Does not start with a digit (starts with "N") ✓
- `looksLikeMetadata` only checks English patterns (SERVES, MAKES, YIELDS, PREP TIME, etc.) — "NA N [noun]" is not covered ✗

With "NA 3 PAPRYKI" surviving hard filters, it enters the candidate pool as an all-caps item and receives the `allCapsBonus` (+0.08). The bilingual detection logic should suppress "PAPRIKA GYERAN-JJIM" from the threshold calculation (it is designed for this exact case: Polish title at position 0, followed by all-caps romanization at position 1). Whether or not that fires correctly, "NA 3 PAPRYKI" remains in `scoredForThreshold` as a competitor.

In the multi-title guard at line 523, when there is exactly one all-caps survivor in `allCapsSelected`, the algorithm collapses to the single highest-scoring candidate overall (`selected.reduce(max score)`). "NA 3 PAPRYKI" with its all-caps bonus beats "Faszerowana papryka" (no bonus, only position factor ×1.12). The correct title loses.

Note: `isStructuralHeading("NA 3 PAPRYKI")` correctly returns false because "NA" has only 2 uppercase letters (< 4 required), so "NA 3 PAPRYKI" does not get the structural bonus. The all-caps bonus alone is sufficient to tip the result.

---

## Common Themes

### 1. Polish metadata patterns absent from `looksLikeMetadata`
Both failures involve Polish recipe conventions not covered by the English-only metadata patterns:
- Failure 1: "PRZYGOTOWANIE 1 GODZ. 45 MIN", "GOTOWANIE 30 MIN", "OCZEKIWANIE 1 GODZ. 30 MIN" flood the candidate pool as short all-caps items, displacing the real title from the top-25 cut.
- Failure 2: "NA 3 PAPRYKI" (serving size) competes directly as a candidate.

Polish patterns that should be filtered: `NA\s+\d+`, `PRZYGOTOWANIE\s+\d+`, `GOTOWANIE\s+\d+`, `OCZEKIWANIE\s+\d+`, `DLA\s+\d+`.

### 2. The 25-candidate pre-filter penalizes multi-word titles
The pre-filter sorts all-caps candidates preferring `wordCount <= 5`. Legitimate recipe titles can easily have 6+ words (e.g. "CHLEBEK Z WARZYWAMI I BOCZKIEM"). In text-heavy recipes with many section headers, the title can be displaced by shorter all-caps metadata fragments. The "short first" heuristic was designed to prefer focused titles, but it operates before any quality scoring — it cannot distinguish a section header from the actual title.

### 3. All-caps bonus amplifies section headers over mixed-case titles
The `allCapsBonus` (+0.08) was designed to reflect the typographic convention of recipe books, but it has no upper bound and applies uniformly to serving sizes, section headers, and ingredient groups as well as true titles. In documents where the correct title is mixed-case (like "Faszerowana papryka"), any all-caps fragment has a scoring advantage regardless of semantic content.

### 4. The prefix filter is guarded by a precondition that can be voided upstream
The prefix filter (line 440) correctly removes "CHLEBEK" when the full title is present, but it cannot fire if the full title was cut by the pre-filter. The correctness of this fix depends on end-to-end candidate survival, which is fragile with the current 25-candidate cap.

# Iteration 9 — Failure Analysis

## Failing case

- **File**: `Faszerowana papryka.real.txt`
- **Expected**: `Faszerowana papryka`
- **Got**: `PAPRIKA GYERAN-JJIM`

---

## Document structure

```
Line 0: Faszerowana papryka          ← correct Polish title (mixed-case)
Line 1: PAPRIKA GYERAN-JJIM          ← ALL_CAPS Korean romanization
Line 2: 파프리카 계란찜               ← Korean script (filtered out)
Line 3: Ten bardzo prosty przepis…   ← body text
Line 5: NA 3 PAPRYKI                 ← ALL_CAPS serving size
Line 9: SKŁADNIKI                    ← ALL_CAPS section header
Line 25: WARZYWA                     ← ALL_CAPS section header
```

---

## Why the failure occurs

### 1. Bilingual detection condition is too strict

The algorithm has a pre-threshold bilingual suppression block (lines 390–395) designed exactly for this pattern: a mixed-case title at position 0 followed by an ALL_CAPS foreign romanization. It fires when:

```typescript
prePos0 && preAllCaps.length === 1 && preAllCaps[0].position <= 2
```

The condition `preAllCaps.length === 1` requires that the document contains **exactly one** ALL_CAPS candidate. This document has four ALL_CAPS candidates that pass `passesHardFilters`:

| Candidate | Position | Why it survives |
|---|---|---|
| `PAPRIKA GYERAN-JJIM` | 1 | All uppercase letters, two words |
| `NA 3 PAPRYKI` | 5 | All uppercase letters, passes vowel/length checks |
| `SKŁADNIKI` | 9 | Polish word, Ł stripped, remaining letters all uppercase |
| `WARZYWA` | 25 | All uppercase, passes all hard filters |

Because `preAllCaps.length === 4`, the bilingual suppression does **not** fire. `PAPRIKA GYERAN-JJIM` enters the scoring pipeline unsuppressed.

### 2. PAPRIKA GYERAN-JJIM accumulates decisive bonuses

`PAPRIKA GYERAN-JJIM` passes `isStructuralHeading` (two words, both ≥4 uppercase alpha letters). It is selected as `firstStructuralHeading` and receives:

- **ALL_CAPS bonus**: +0.08
- **Structural heading bonus**: +0.10
- **Position factor** ≈ ×1.11 (position 1, near top)

Total additive bonus: **+0.18** above its raw embedding score.

`Faszerowana papryka` receives:

- **Position factor** ≈ ×1.12 (position 0)
- No ALL_CAPS bonus (mixed-case)
- No structural heading bonus

Even if `Faszerowana papryka` has a meaningfully better raw embedding similarity to the title reference, the 0.18-point bonus gap is large enough that `PAPRIKA GYERAN-JJIM` wins.

### 3. `PAPRIKA GYERAN-JJIM` semantically resembles a recipe title

The Korean romanization `PAPRIKA GYERAN-JJIM` is a legitimate dish name. Its embedding similarity to the title reference ("recipe name, dish title, nazwa dania") is plausibly competitive with `Faszerowana papryka`, so even the raw embedding signal doesn't cleanly favour the correct answer.

---

## Root cause

The bilingual detection was written for the minimal case: one mixed-case title plus one ALL_CAPS romanization, nothing else. Real-world recipes routinely include additional ALL_CAPS lines for section headers (SKŁADNIKI, WARZYWA, PRZYGOTOWANIE) and serving sizes (NA 3 PAPRYKI). These innocuous lines break the `preAllCaps.length === 1` guard and disable the suppression entirely.

---

## Pattern generalisation

The failure belongs to the class: **bilingual recipe page with structural ALL_CAPS section headers**. The correct heuristic is not "exactly one ALL_CAPS candidate exists" but rather "the ALL_CAPS candidate immediately after position-0 appears to be a romanization/translation of the mixed-case title, regardless of how many other ALL_CAPS lines exist elsewhere in the document". A positional check (is the ALL_CAPS candidate at position ≤ 2?) combined with a semantic proximity check (does it embed close to the mixed-case candidate?) would be more robust than the count-based guard.

# Iteration 10 — Improvement Plan

## Correction to Feedback Root Cause (Failure 1)

The feedback states that "CHLEBEK Z WARZYWAMI I BOCZKIEM" has 6 words and gets penalized by the pre-filter's `wordCount <= 5` sort. This is incorrect — the title has **5 words** (CHLEBEK, Z, WARZYWAMI, I, BOCZKIEM), so `wordCount(text) <= 5` is true and it sorts into the highest-priority tier alongside other short ALL_CAPS candidates. The pre-filter does not cut it.

The actual root cause is a **structural heading mis-selection combined with dedup**:

1. Both "CHLEBEK Z WARZYWAMI I BOCZKIEM" (position 1) and "WARZYWA I BOCZEK" (position 2) qualify as structural headings via `isStructuralHeading`.
2. `bestStructural` is selected by `rawScore`. If MiniLM rates "WARZYWA I BOCZEK" higher (plausible — it's a tighter food phrase that may embed closer to the title reference), it wins the structural heading slot.
3. `firstStructuralHeading` = "WARZYWA I BOCZEK". The prefix filter at line 440 then removes prefixes of "WARZYWA I BOCZEK", not prefixes of the real title.
4. "CHLEBEK" (position 8, a sub-section header for the bread part) is **not** a prefix of "WARZYWA I BOCZEK", so it survives the prefix filter.
5. Dedup at line 489: "CHLEBEK Z WARZYWAMI I BOCZKIEM" contains "CHLEBEK" (shorter) → the real title is removed. "CHLEBEK" wins.

The prefix filter is structurally correct but depends on `bestStructural` being the real title — a precondition the algorithm cannot guarantee with cross-lingual embeddings.

---

## Fix 1: Polish Metadata Patterns in `looksLikeMetadata`

### Root cause
Polish recipe conventions use patterns invisible to the English-only metadata regex:
- **Serving size**: "NA 3 PAPRYKI" (for 3 peppers), "NA OKOŁO 1 ½ KG" (for about 1.5 kg), "DLA 4 OSÓB" (for 4 people)
- **Time metadata**: "PRZYGOTOWANIE 1 GODZ. 45 MIN", "GOTOWANIE 30 MIN", "OCZEKIWANIE 1 GODZ. 30 MIN"
- **OCR-corrupted time metadata**: "PRZYGOTOWANTE 20 MIN" (E→A), "GOTOMANTE 15 MIN" (OWANIE→MANTE)

These survive all hard filters, enter the candidate pool, accumulate ALL_CAPS bonus, and compete with real titles.

### Specific changes

Add to `METADATA_PATTERNS` in `title-extractor.ts`:

**Before:**
```typescript
const METADATA_PATTERNS = [
  /^(SERVES?|MAKES?|YIELDS?)\b/i,
  /^(PREP(ARATION)?|COOK(ING)?|PROOF|RISING|FERMENTATION|REST(ING)?)\s*(AND\s*)?(COOK(ING)?)?\s*TIME/i,
  /^SAMPLE\s+SCHEDULE\b/i,
  /^BULK\s+FERMENTATION\b/i,
  /^(THIS\s+RECIPE\s+)?MAKES\b/i,
];
```

**After:**
```typescript
const METADATA_PATTERNS = [
  /^(SERVES?|MAKES?|YIELDS?)\b/i,
  /^(PREP(ARATION)?|COOK(ING)?|PROOF|RISING|FERMENTATION|REST(ING)?)\s*(AND\s*)?(COOK(ING)?)?\s*TIME/i,
  /^SAMPLE\s+SCHEDULE\b/i,
  /^BULK\s+FERMENTATION\b/i,
  /^(THIS\s+RECIPE\s+)?MAKES\b/i,
  // Polish serving-size patterns: "NA 3 PAPRYKI", "NA OKOŁO 1 KG", "DLA 4 OSÓB"
  /^NA\s+(\d|OKOŁO)\b/i,
  /^DLA\s+\d/i,
  // Time-unit metadata: any line containing "N MIN" or "N GODZ" is prep/cook/rest time,
  // regardless of OCR-corrupted prefix (catches PRZYGOTOWANTE, GOTOMANTE, etc.)
  /\b\d+\s*MIN\b/i,
  /\b\d+\s*GODZ/i,
];
```

### Why time-unit patterns are safe as metadata filters

Could `\b\d+\s*MIN\b` accidentally filter a legitimate recipe title? No:
- "30 Minute Bread" starts with a digit → already rejected by `startsWithNumber`
- "MINESTRONE" has "MIN" but no preceding digit → doesn't match
- "5 MIN NOODLES" starts with digit → already rejected
- In the entire 10-iteration test corpus, no legitimate title contains "digit + MIN" or "digit + GODZ"

### Impact on test cases

| Candidate | Pattern matched | Effect |
|---|---|---|
| "NA 3 PAPRYKI" | `^NA\s+\d` | **Filtered** — fixes Failure 2 directly |
| "NA OKOŁO 1 ½ KG" | `^NA\s+OKOŁO` | Filtered — correct for Kimchi input |
| "DLA 4 OSÓB" / "DLA 4 OSOB" | `^DLA\s+\d` | Filtered — reduces noise in CHLEBEK and MŁODE PORY |
| "PRZYGOTOWANIE 1 GODZ. 45 MIN" | `\b\d+\s*MIN` (via "45 MIN") | Filtered |
| "GOTOWANIE 30 MIN" | `\b\d+\s*MIN` | Filtered |
| "OCZEKIWANIE 1 GODZ. 30 MIN" | `\b\d+\s*MIN` | Filtered |
| "PRZYGOTOWANTE 20 MIN" | `\b\d+\s*MIN` | **Filtered** — catches OCR error |
| "GOTOMANTE 15 MIN" | `\b\d+\s*MIN` | **Filtered** — catches OCR error |
| "PIECZENIE 30 MINUT" | `\b\d+\s*MIN` | Filtered (hypothetical) |
| "Leżakowanie" | none (no digit) | Not filtered — correct |

### Expected impact on Failure 2

With "NA 3 PAPRYKI" filtered as metadata, the candidates for "Faszerowana papryka.real.txt" become:
- "Faszerowana papryka" (position 0, mixed-case)
- "PAPRIKA GYERAN-JJIM" (position 1, ALL_CAPS)
- "SKŁADNIKI" (position 9, single-word ALL_CAPS)
- "WARZYWA" (position 25, single-word ALL_CAPS)
- Various body text joins

The bilingual suppression correctly fires (position-0 mixed-case + position-1 ALL_CAPS with semantic similarity > 0.4). "PAPRIKA GYERAN-JJIM" is suppressed from threshold computation. "Faszerowana papryka" wins.

---

## Fix 2: Pre-dedup Sub-section Header Removal

### Root cause

The dedup rule at line 489 unconditionally prefers shorter candidates when one is a substring of another. This is correct for most cases (e.g., "Pierogi Ruskie" over "Pierogi Ruskie 200g mąki 3 ziemniaki") but destructive when a short **sub-section header** shares words with the actual title.

In the CHLEBEK case: "CHLEBEK" (position 8) is a sub-section header for the bread portion of the recipe. It is a substring of the actual title "CHLEBEK Z WARZYWAMI I BOCZKIEM" (position 1). The dedup rule removes the real title.

The existing prefix filter at line 440 was designed to handle this, but it only removes prefixes of `firstStructuralHeading`. When `bestStructural` resolves to "WARZYWA I BOCZEK" instead of the real title (due to cross-lingual embedding noise), the prefix filter targets the wrong heading and "CHLEBEK" survives.

### Specific changes

Add a pre-dedup filter between the continuation join protection (line 482) and the dedup (line 489). The filter identifies **sub-section headers**: ALL_CAPS candidates that are followed in the source document by ingredient-like content.

**Insert after line 482, before the dedup block:**

```typescript
// Pre-dedup: remove sub-section headers that are substrings of other surviving candidates.
// A sub-section header is an ALL_CAPS candidate followed by ingredient-like lines in the source.
// Example: "CHLEBEK" (bread section header, followed by "500 g mąki") is a substring of
// "CHLEBEK Z WARZYWAMI I BOCZKIEM" (the real title). Without this filter, dedup kills the title.
selected = selected.filter((candidate) => {
  if (!isAllCaps(candidate.text)) return true;
  // Check if this candidate is followed by ingredient-like content
  const nextSourceLines = lines.slice(candidate.position + 1, candidate.position + 3);
  const followedByIngredients = nextSourceLines.some(
    (l) => looksLikeIngredient(l.trim()) || /^\s*\d/.test(l.trim())
  );
  if (!followedByIngredients) return true;
  // Only remove if a longer candidate contains this one as a substring
  const candidateLower = candidate.text.toLowerCase();
  const hasLongerParent = selected.some(
    (other) =>
      other !== candidate &&
      other.text.length > candidate.text.length &&
      other.text.toLowerCase().includes(candidateLower)
  );
  return !hasLongerParent;
});
```

### Why this is safe

The filter requires **three conditions** to fire simultaneously:
1. The candidate is ALL_CAPS
2. It is followed by ingredient-like lines (strong sub-section signal)
3. A longer candidate containing it as a substring also survived threshold

This is conservative — it only resolves the specific conflict where a sub-section header's name overlaps with the title. It cannot remove standalone titles because condition (3) requires a longer superset candidate to exist.

### Regression analysis

| Test case | Effect |
|---|---|
| ARAYES SHRAK | "ARAYES" (1 word) doesn't survive threshold independently — never reaches dedup. No change. |
| Baked Eggs | No ALL_CAPS sub-section headers that are substrings of the title. No change. |
| CHLEBEK Z WARZYWAMI I BOCZKIEM | **"CHLEBEK" removed** — followed by "500 g mąki" (ingredient) and is substring of real title. Fix applied. |
| Finnish Flatbreads | Two separate recipe titles, neither is a substring of the other. No change. |
| Faszerowana papryka | Already fixed by Fix 1 (NA 3 PAPRYKI filtered). No sub-section header conflict. No change. |
| MIXED SEED CRISPBREAD | No sub-section header conflicts. No change. |
| OVERNIGHT STRAIGHT PIZZA DOUGH | No sub-section header conflicts. No change. |
| SAFFRON WHEAT BUNS | No sub-section header conflicts. No change. |
| Kimchi z ogórków | "SKŁADNIKI" is ALL_CAPS and followed by ingredients, but no longer candidate contains "SKŁADNIKI". Condition (3) fails. No change. |
| MŁODE PORY DUSZONE W PIWIE | No ALL_CAPS sub-section headers that are substrings of the title. No change. |

### Expected impact on Failure 1

With Fix 1 removing "DLA 4 OSÓB", "PRZYGOTOWANIE 1 GODZ. 45 MIN", "GOTOWANIE 30 MIN", and "OCZEKIWANIE 1 GODZ. 30 MIN" from the candidate pool, the remaining ALL_CAPS candidates are:
- "CHLEBEK Z WARZYWAMI I BOCZKIEM" (position 1)
- "WARZYWA I BOCZEK" (position 2)
- "CHLEBEK" (position 8)

Fix 1 alone helps by reducing noise, but the core CHLEBEK/dedup issue persists. Fix 2 then removes "CHLEBEK" because:
- It's ALL_CAPS ✓
- Followed by "500 g mąki" (ingredient) ✓
- "CHLEBEK Z WARZYWAMI I BOCZKIEM" contains "CHLEBEK" and is longer ✓

Similarly, "WARZYWA I BOCZEK" at position 2 is followed by "500 g strączków zielonego groszku" (ingredient) and is a substring of "WARZYWA I BOCZEK" — wait, no. Is "WARZYWA I BOCZEK" a substring of "CHLEBEK Z WARZYWAMI I BOCZKIEM"? "warzywa i boczek" vs "chlebek z warzywami i boczkiem" — no, "warzywami" ≠ "warzywa". So condition (3) fails for "WARZYWA I BOCZEK". It survives.

Final candidates after Fix 2: "CHLEBEK Z WARZYWAMI I BOCZKIEM" and "WARZYWA I BOCZEK". The multi-title guard (line 504) fires with 2 ALL_CAPS candidates. `isSubHeader` checks if "WARZYWA I BOCZEK" (the non-first) is followed by ingredients → yes → `isSubHeader = true` → collapses to `[sortedCaps[0]]` = "CHLEBEK Z WARZYWAMI I BOCZKIEM" (position 1 < position 2).

Result: **"CHLEBEK Z WARZYWAMI I BOCZKIEM"** — correct.

---

## Fix 3: Structural Heading Selection Robustness (Optional)

### Root cause

`bestStructural` is chosen purely by `rawScore`, which depends on MiniLM cross-lingual embedding quality. For Polish text, the model may not reliably rank a 5-word compound title above a 3-word food phrase. This makes the downstream prefix filter fragile.

### Specific changes

Add a tiebreaker to `bestStructural` selection: when rawScores are within 0.03 of each other, prefer the candidate with more words (longer title = more specific = more likely the actual title, not a section header). If word counts are also equal, prefer the earlier position.

**Before:**
```typescript
const bestStructural = structuralCandidates.length > 0
  ? structuralCandidates.reduce((a, b) => a.rawScore > b.rawScore ? a : b)
  : null;
```

**After:**
```typescript
const bestStructural = structuralCandidates.length > 0
  ? structuralCandidates.reduce((a, b) => {
      const scoreDiff = a.rawScore - b.rawScore;
      if (Math.abs(scoreDiff) > 0.03) return scoreDiff > 0 ? a : b;
      // Tiebreak: more words (more specific) → better
      const wcDiff = wordCount(b.text) - wordCount(a.text);
      if (wcDiff !== 0) return wcDiff > 0 ? b : a;
      // Tiebreak: earlier position → better
      return a.position < b.position ? a : b;
    })
  : null;
```

This makes the prefix filter at line 440 more likely to target the correct (longer, more specific) heading, providing defense-in-depth alongside Fix 2. With a 0.03 threshold, a clearly better rawScore still wins.

### Risk assessment

Low risk. Only changes behavior when two structural headings have nearly identical rawScores (within 0.03). In that case, preferring the longer/earlier candidate is almost always correct — a sub-section header is never the title when a longer heading containing the same topic exists.

---

## Summary

| Fix | Addresses | Mechanism | Risk |
|---|---|---|---|
| **Fix 1**: Polish metadata patterns | Failure 2 directly; reduces Failure 1 noise | Hard filter in `looksLikeMetadata` | Very low — patterns are specific and well-attested |
| **Fix 2**: Pre-dedup sub-section removal | Failure 1 directly | Pre-dedup filter gated on 3 conditions | Low — conservative triple-condition gate |
| **Fix 3**: Structural heading tiebreaker | Failure 1 (defense-in-depth) | Tiebreaker with 0.03 threshold | Very low — only changes close-call decisions |

### Expected accuracy after fixes

All 8 existing test cases should pass. The 2 new test cases (Kimchi z ogórków, MŁODE PORY DUSZONE W PIWIE) should also benefit from the Polish metadata patterns.

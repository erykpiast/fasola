# Improvement Plan — Iteration 2

## Summary

Five changes targeting the six identified failure patterns. Expected impact: 5/6 cases fixed (83% → ~100% on real inputs). Changes are ordered by expected impact, highest first.

---

## Change 1: Position-Weighted Scoring

**Addresses:** Failures 1, 4, 5 (titles at position 0 or as first ALL_CAPS heading lose to body text)

**Root cause:** The score formula `titleSim - max(headerSim, noiseSim)` has no position signal. Embedding similarity alone cannot reliably distinguish a title from food-related body text. Recipe titles appear at the top of the OCR output in 4/6 cases, and as the first ALL_CAPS heading in 5/6.

**Change:** Add a position decay bonus to the composite score. Early candidates get up to +0.15 boost; candidates past 50% of the document get zero.

```typescript
// BEFORE (line 197):
const score = titleSim - Math.max(headerSim, noiseSim);

// AFTER:
const rawScore = titleSim - Math.max(headerSim, noiseSim);
const relativePosition = candidate.position / lines.length;
const positionBonus = relativePosition < 0.5
  ? 0.15 * (1 - relativePosition * 2)
  : 0;
const score = rawScore + positionBonus;
```

**Why 0.15:** MiniLM cosine similarities for recipe text typically range 0.1–0.5. A 0.15 bonus at position 0 is enough to tip the balance for titles that are semantically ambiguous (like "OVERNIGHT STRAIGHT PIZZA DOUGH") without overwhelming genuinely high-scoring body text.

**Expected impact:**
- **ARAYES SHRAK** (position 0): The 2-line join "ARAYES SHRAK" gets +0.15, likely enough to beat "pepper" and "MAKES 8 ARAYES" which appear much later.
- **OVERNIGHT STRAIGHT PIZZA DOUGH** (position 0): Gets +0.15 vs "or anytime over the next 2 days." (position ~7/30 = 0.23 → +0.08) and "Fine sea salt" (position ~21/30 = 0.70 → +0.0). Should now win.
- **SAFFRON WHEAT BUNS** (position 54/76 = 0.71): No position bonus, but the OCR quality gate (Change 3) removes the garbled competitors.

---

## Change 2: Recipe Metadata Blocklist

**Addresses:** Failures 1, 2 (MAKES/SERVES lines incorrectly treated as title candidates)

**Root cause:** Lines like `SERVES *`, `MAKES 8 ARAYES`, `PREP TIME`, `BULK FERMENTATION` pass all hard filters. They are recipe metadata, not titles.

**Change:** Add a `looksLikeMetadata` filter to `passesHardFilters`:

```typescript
// NEW function:
const METADATA_PATTERNS = [
  /^(SERVES?|MAKES?|YIELDS?)\b/i,
  /^(PREP(ARATION)?|COOK(ING)?|PROOF|RISING|FERMENTATION|REST(ING)?)\s*(AND\s*)?(COOK(ING)?)?\s*TIME/i,
  /^SAMPLE\s+SCHEDULE\b/i,
  /^BULK\s+FERMENTATION\b/i,
  /^(THIS\s+RECIPE\s+)?MAKES\b/i,
];

function looksLikeMetadata(text: string): boolean {
  return METADATA_PATTERNS.some((pattern) => pattern.test(text.trim()));
}

// MODIFIED passesHardFilters:
function passesHardFilters(text: string): boolean {
  if (text.length < 3 || text.length > 80) return false;
  if (looksLikeIngredient(text)) return false;
  if (startsWithNumber(text)) return false;
  if (looksLikeMetadata(text)) return false;  // NEW
  return true;
}
```

**Expected impact:**
- **ARAYES SHRAK**: `MAKES 8 ARAYES` filtered out, no longer competes.
- **Baked Eggs**: `SERVES *` filtered out, no longer joins the result.
- **OVERNIGHT STRAIGHT PIZZA DOUGH**: `BULK FERMENTATION`, `PROOF TIME`, `SAMPLE SCHEDULE` all filtered.

---

## Change 3: OCR Quality Gate

**Addresses:** Failures 3, 5 (garbled OCR fragments like "ssekart", "DAT FLATBREADS", "ng sheet with baking")

**Root cause:** Garbled OCR output passes all hard filters because it's syntactically valid (3–80 chars, no measurements, no leading numbers). The algorithm has no mechanism to detect low-quality text.

**Change:** Add an `isLikelyGarbled` check that penalizes text with indicators of OCR corruption:

```typescript
function isLikelyGarbled(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 2) return true;

  // Check vowel ratio — English/Polish text typically has 30-50% vowels
  const vowels = letters.replace(/[^aeiouAEIOUyYąęóĄĘÓ]/g, "").length;
  const vowelRatio = vowels / letters.length;
  if (vowelRatio < 0.15 || vowelRatio > 0.85) return true;

  // Single orphaned word ≤3 letters that isn't a common word
  const words = text.trim().split(/\s+/);
  const COMMON_SHORT = new Set(["the", "and", "for", "but", "not", "you", "all", "can", "had", "her", "was", "one", "our", "out", "are", "has", "his", "how", "its", "may", "new", "now", "old", "see", "way", "who", "did", "get", "let", "say", "she", "too", "use"]);
  if (words.length === 1 && letters.length <= 3 && !COMMON_SHORT.has(text.trim().toLowerCase())) {
    return true;
  }

  // Line starts with lowercase and is a sentence fragment (no capital start, no period end)
  // Strong OCR corruption indicator when combined with short length
  if (text.length < 25 && /^[a-z]/.test(text.trim()) && !text.trim().endsWith(".")) {
    return true;
  }

  return false;
}
```

Add to `passesHardFilters`:
```typescript
function passesHardFilters(text: string): boolean {
  if (text.length < 3 || text.length > 80) return false;
  if (looksLikeIngredient(text)) return false;
  if (startsWithNumber(text)) return false;
  if (looksLikeMetadata(text)) return false;
  if (isLikelyGarbled(text)) return false;  // NEW
  return true;
}
```

**Expected impact:**
- **FINNISH MILK FLATBREADS**: `DAT FLATBREADS` (starts lowercase-ish, garbled), `ng sheet with baking` (starts lowercase, fragment) filtered out.
- **SAFFRON WHEAT BUNS**: `ssekart` (no vowel pattern), `The` (single 3-letter word passes COMMON_SHORT — but see note), `favoured by` (starts lowercase, short fragment), `alled out into names.` (starts lowercase) all filtered.

**Note:** "The" alone is in COMMON_SHORT so won't be caught by the single-word filter, but it will be caught by the lowercase-start-fragment check if we also add a minimum word count check. Actually "The" starts with uppercase. We should add a separate check: single-word candidates ≤ 4 chars that are common English words (articles, prepositions) are unlikely titles. Add:

```typescript
const NON_TITLE_WORDS = new Set(["the", "and", "for", "but", "not", "you", "all", "can", "are", "was", "has", "his", "her", "its", "our", "who", "how", "may", "new", "now", "old", "see", "way", "did", "get", "let", "say", "she", "too", "use", "buns", "with"]);

// In passesHardFilters, after other checks:
const singleWord = text.trim().split(/\s+/);
if (singleWord.length === 1 && NON_TITLE_WORDS.has(text.trim().toLowerCase())) {
  return false;
}
```

---

## Change 4: ALL_CAPS Heading Bonus

**Addresses:** Failures 1, 3, 4, 5 (ALL_CAPS lines are strong structural signals in recipe books)

**Root cause:** The algorithm treats ALL_CAPS lines the same as mixed-case body text during scoring. In recipe books, ALL_CAPS is the primary visual indicator of section headings and titles.

**Change:** Add an ALL_CAPS bonus in the scoring phase:

```typescript
// In the scoring loop, after computing rawScore:
const allCapsBonus = isAllCaps(candidate.text) && candidate.text.replace(/[^a-zA-Z]/g, "").length >= 4
  ? 0.08
  : 0;
const score = rawScore + positionBonus + allCapsBonus;
```

**Why 0.08:** Smaller than the position bonus because ALL_CAPS alone isn't definitive (e.g., `SERVES`, `INGREDIENT` are also ALL_CAPS). Combined with position bonus, this creates a strong signal for ALL_CAPS text at the top of the document.

**Expected impact:**
- **ARAYES SHRAK** (ALL_CAPS, position 0): +0.15 (position) + 0.08 (caps) = +0.23 total bonus.
- **FINNISH MILK FLATBREADS** (ALL_CAPS, position ~16/40): +0.09 (position) + 0.08 (caps) = +0.17.
- **OVERNIGHT STRAIGHT PIZZA DOUGH** (ALL_CAPS, position 0): +0.15 + 0.08 = +0.23.

---

## Change 5: Stricter Candidate Selection & Single-Title Default

**Addresses:** Failure 2 (spurious second candidate joined with `+`), failure pattern 6 (ambiguous output format)

**Root cause:** The threshold `max(0.05, bestScore * 0.6)` is permissive — many candidates survive. The `+` join creates false multi-title outputs when only one title exists.

**Change:** Two modifications:

### 5a. Raise the relative threshold

```typescript
// BEFORE (line 207):
const threshold = Math.max(0.05, bestScore * 0.6);

// AFTER:
const threshold = Math.max(0.08, bestScore * 0.8);
```

This means the second-best candidate must score within 80% of the best (was 60%). Only genuinely competitive candidates survive.

### 5b. Require structural evidence for multi-title output

Only join multiple candidates with `+` if there is structural evidence of multiple recipes (multiple ALL_CAPS headings separated by body text). Otherwise, return only the single best candidate.

```typescript
// AFTER filtering and deduplication:
if (selected.length > 1) {
  // Only keep multiple candidates if they are both ALL_CAPS headings
  // (strong indicator of multi-recipe pages)
  const allCapsSelected = selected.filter((s) => isAllCaps(s.text));
  if (allCapsSelected.length > 1) {
    selected = allCapsSelected;
  } else {
    // Single recipe — keep only the highest-scoring candidate
    selected = [selected.reduce((a, b) => a.score > b.score ? a : b)];
  }
}

selected.sort((a, b) => a.position - b.position);
selected = selected.slice(0, 3);
```

**Expected impact:**
- **Baked Eggs**: Even if `SERVES *` survives other filters (it shouldn't after Change 2), it won't be joined because it's not both ALL_CAPS headings with the title.
- **FINNISH MILK + POTATO FLATBREADS**: Both titles are ALL_CAPS headings — correctly joined.

---

## Change 6: Fix findBurstEnd for Short Titles

**Addresses:** Edge case where legitimate 1-2 line short titles are at position 0

**Root cause:** The burst detection requires ≥3 consecutive short lines. This doesn't cause problems currently (ARAYES SHRAK has only 2 short lines so burst isn't triggered), but the logic should be improved to avoid future issues.

**Change:** Instead of a fixed threshold, make burst detection OCR-quality-aware. Only skip initial short lines if they look garbled:

```typescript
function findBurstEnd(lines: Array<{ text: string }>): number {
  let i = 0;
  while (i < lines.length && lines[i].text.length < 20 && isLikelyGarbled(lines[i].text)) {
    i++;
  }
  return i;
}
```

This way, short-but-valid lines like "ARAYES" and "SHRAK" are never skipped, while garbled fragments like "ssekart", "Bas", "ites" at the top of the MIXED SEED CRISPBREAD input are properly skipped.

**Expected impact:** More robust handling of documents that start with either short valid titles or garbled OCR. No regression on current passing cases.

---

## Projected Results

| Test Case | Current | After Changes | Key Changes |
|---|---|---|---|
| ARAYES SHRAK | FAIL | PASS | Position bonus + caps bonus + metadata filter removes "MAKES 8 ARAYES" |
| Baked Eggs with Feta... | FAIL | PASS | Metadata filter removes "SERVES *", stricter selection picks single title |
| FINNISH MILK + POTATO FLATBREADS | FAIL | LIKELY PASS | OCR quality gate removes garbled text, caps bonus boosts real titles, multi-title detection via ALL_CAPS |
| OVERNIGHT STRAIGHT PIZZA DOUGH | FAIL | PASS | Position bonus (+0.15) + caps bonus (+0.08) overwhelm body text scores |
| SAFFRON WHEAT BUNS... | FAIL | LIKELY PASS | OCR quality gate removes garbled top, caps bonus boosts ALL_CAPS title at lines 54-55. Risk: title is at position 0.71 (no position bonus); relies on caps bonus + clean candidate pool |
| MIXED SEED CRISPBREAD | PASS | PASS | No regression — garbled burst at top still skipped, title at line 18 still found |

**Confidence:** High for 4/5 failures. The SAFFRON WHEAT BUNS case is harder because the title is deep in the document (position 0.71), so position bonus doesn't help. Success depends on the OCR quality gate eliminating enough garbled competitors that the ALL_CAPS bonus is sufficient. If this case still fails, a follow-up iteration could add a "first ALL_CAPS heading" heuristic that explicitly searches for the first ALL_CAPS line with ≥3 words as a strong title candidate regardless of position.

---

## Implementation Notes

- All changes are in `lib/text-classifier/title-extractor.ts` except possibly extracting `METADATA_PATTERNS` to a shared constants file if used elsewhere.
- The `isLikelyGarbled` function should be unit-tested with known garbled and valid text samples.
- The `looksLikeMetadata` patterns should be tested against the real OCR files.
- Performance: All new logic is O(n) string operations on candidates already capped at 25. No additional embedding calls. Well within the 10-second budget.
- The `scored` array type needs updating to carry the `score` field into the selection phase for Change 5b.

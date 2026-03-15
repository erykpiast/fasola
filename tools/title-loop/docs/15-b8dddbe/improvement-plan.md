# Iteration 16 — Improvement Plan

## Overview

Three failures, five distinct bugs, but a shared theme: **OCR corruption and edge-case formatting bypass filters designed for clean input**. The fixes below are targeted — each addresses a specific filter gap rather than restructuring the pipeline. The current architecture (candidate generation → embedding scoring → dedup) is sound; the failures are at the filter layer.

**Accuracy trajectory:** 15 → 72.7% (8/11). Three real-input recipes failing. Target: 11/11 (100%).

---

## Failure 1: KREM SELEROWY Z GORGONZOLA → `UuIw`

**Expected:** `KREM SELEROWY Z GORGONZOLA`
**Got:** `UuIw`

### Root Cause Analysis

Two compounding bugs:

**Bug A: Breadcrumb line triggers false bilingual detection.**

`/ Jesien / Zupy` is a book navigation breadcrumb (Autumn / Soups section), not a recipe title. It sits at position 0, is mixed-case, and passes all hard filters. The bilingual layout detection (Method 2, line 517) then fires:

- `prePos0 = "/ Jesien / Zupy"` (mixed-case at position 0, ≥2 words)
- `nearbyAllCaps` includes `KREM SELEROWY Z GORGONZOLA` (position 1, ALL_CAPS)
- Word sets: `{"jesien", "zupy"}` vs `{"krem", "selerowy", "gorgonzola"}` — no overlap
- Result: `KREM SELEROWY Z GORGONZOLA` is classified as a "translation candidate" and **suppressed**

The existing `" | "` pipe filter (line 180) was designed for this exact category of separators, but only handles pipe characters. Forward-slash breadcrumbs like `/ Jesien / Zupy` use the same pattern but escape the filter.

**Bug B: `UuIw` escapes the garbled-text filter.**

After the real title is suppressed, `UuIw` wins by default. It passes `isLikelyGarbled` because:
- 4 letters — the single-word check requires `letters.length <= 3`; 4 escapes it
- Vowel ratio 3/4 = 0.75 — within the 0.15–0.85 range
- No `[a-z][A-Z]` detection exists for mid-word casing transitions

### Fix A: Breadcrumb filter in `passesHardFilters`

Add a hard filter for lines containing 2+ forward-slash characters. These are navigation breadcrumbs (e.g., `/ Section / Subsection`), never recipe titles.

**Before (line 180):**
```typescript
// Pipe-separated lines are book category/chapter headers, not recipe titles
if (text.includes(" | ")) return false;
```

**After:**
```typescript
// Pipe-separated lines are book category/chapter headers, not recipe titles
if (text.includes(" | ")) return false;
// Slash-separated breadcrumbs (e.g., "/ Jesien / Zupy") are navigation, not titles
// Only filter when 2+ slashes are present — single-slash lines like
// "TITLE / SUBTITLE" are legitimate continuation-merged titles
if ((text.match(/\//g) || []).length >= 2) return false;
```

**Safety analysis:**
- `SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)` — 1 slash. Not filtered. Safe.
- `TITLE FIRST PART / SECOND PART` — 1 slash. Not filtered. Safe.
- `/ Jesien / Zupy` — 2 slashes. Filtered. Correct.
- Could any legitimate title have 2+ slashes? Recipe titles don't use `/` as enumeration separators (they use "and", "or", or ","): vanishingly unlikely.

### Fix B: Mid-word casing transition in `isLikelyGarbled`

Add detection for single words with internal lowercase-to-uppercase transitions. In natural language (English, Polish, Korean romanization), a lowercase letter is never followed by an uppercase letter within a single word. This pattern is diagnostic of OCR noise.

**Before (after the single-word short check, around line 137):**
```typescript
if (words.length === 1 && letters.length <= 3 && !COMMON_SHORT.has(text.trim().toLowerCase())) {
  return true;
}
```

**After (add a new check after the existing single-word check):**
```typescript
if (words.length === 1 && letters.length <= 3 && !COMMON_SHORT.has(text.trim().toLowerCase())) {
  return true;
}

// Single word with internal lowercase→uppercase transition — OCR noise (e.g., "UuIw", "aBC")
// No natural language produces this pattern in a single word.
if (words.length === 1 && /[a-z][A-Z]/.test(text.trim())) {
  return true;
}
```

**Safety analysis:**
- `UuIw` → `u` followed by `I` → filtered. Correct.
- `KREM` → all uppercase, no `[a-z][A-Z]` match. Safe.
- `Smażona` → `ż` (non-ASCII) followed by `o` (lowercase) → no match. Safe.
- `McRib` → hypothetical concern, but no recipe title uses CamelCase brand names as standalone candidates. And this only fires on `words.length === 1`.
- All existing test titles: standard Title Case, ALL_CAPS, or sentence case. No `[a-z][A-Z]` transitions. Safe.

**Combined effect on Failure 1:**
- Fix A prevents `/ Jesien / Zupy` from entering the candidate pool entirely → bilingual detection never fires on it → `KREM SELEROWY Z GORGONZOLA` is not suppressed → it wins as the structural heading.
- Fix B provides defense in depth: even if a different code path somehow let `UuIw` compete, it would be filtered as garbled.
- Both fixes are independently sufficient to prevent `UuIw` from winning; together they eliminate both root causes.

---

## Failure 2: LABANEH BALLS WITH NIGELLA SEEDS → `BALLS`

**Expected:** `LABANEH BALLS WITH NIGELLA SEEDS`
**Got:** `BALLS`

### Root Cause Analysis

The `capsCoalesced` merge pass (added in iteration 14) correctly assembles lines 0–3 into `LABANEH BALLS WITH NIGELLA SEEDS` at position 0. This is working as designed.

The failure is caused by a **metadata fragment leak**. The source text contains:
```
Line 13: MAKES 25 LABANEH    ← filtered by /^(THIS\s+RECIPE\s+)?MAKES\b/i
Line 14: BALLS               ← orphaned — passes all hard filters
```

These two source lines form a single metadata phrase: "MAKES 25 LABANEH BALLS" (yield information). The metadata filter correctly catches line 13, but `BALLS` on line 14 survives as a standalone candidate at position ~14.

In the dedup step, `BALLS` eliminates `LABANEH BALLS WITH NIGELLA SEEDS` via "shorter wins":
```
"labaneh balls with nigella seeds".includes("balls") && 5 < 32 → true
```

The pre-dedup sub-section header filter (line 611) does not help because `BALLS` (position 14) is followed by prose text, so `followedByIngredients = false` and it is kept.

### Fix: Metadata continuation suppression

When a line is identified as metadata by `looksLikeMetadata`, also suppress the immediately following line if it is a short ALL_CAPS fragment (≤2 words, ≤15 chars). This catches the common OCR pattern where yield/serving metadata wraps across two lines.

**Implementation location:** In `buildCandidates`, in the candidate generation loop (starting at line 294). Track when the preceding line was metadata and skip the continuation.

**Before (line 294):**
```typescript
for (let i = 0; i < mergedLines.length; i++) {
  const line = mergedLines[i];

  // Single line
  if (passesHardFilters(line.text)) {
```

**After:**
```typescript
// Build a set of positions to skip: short ALL_CAPS lines immediately following metadata
const metadataContinuationPositions = new Set<number>();
for (let i = 0; i < mergedLines.length - 1; i++) {
  if (looksLikeMetadata(mergedLines[i].text)) {
    const next = mergedLines[i + 1];
    if (isAllCaps(next.text) && wordCount(next.text) <= 2 && next.text.length <= 15) {
      metadataContinuationPositions.add(next.index);
    }
  }
}

for (let i = 0; i < mergedLines.length; i++) {
  const line = mergedLines[i];

  // Skip metadata continuation fragments
  if (metadataContinuationPositions.has(line.index)) continue;

  // Single line
  if (passesHardFilters(line.text)) {
```

**Why this works:**
- `MAKES 25 LABANEH` → `looksLikeMetadata` returns true
- Next line `BALLS` → `isAllCaps` true, 1 word, 5 chars ≤ 15
- `BALLS` position is added to `metadataContinuationPositions`
- `BALLS` is skipped during candidate generation
- `LABANEH BALLS WITH NIGELLA SEEDS` (from capsCoalesced at position 0) has no shorter substring competitor in dedup → survives intact

**Safety analysis:**
- Only fires when the **immediately preceding** mergedLine is metadata. Random ALL_CAPS words elsewhere are not affected.
- The ≤2 words, ≤15 chars thresholds ensure only short fragments are suppressed. A legitimate recipe title like `WARZYWA I BOCZEK` (3 words, 16 chars) would not be suppressed even if it followed metadata.
- The dedup logic is NOT modified (respecting the "DO NOT CHANGE" comment on line 631).
- This does not affect any existing test cases: none have a metadata line immediately followed by a short ALL_CAPS word.

**Alternative considered — modifying dedup:** Adding a "don't let single words eliminate multi-word candidates" rule to dedup would also fix this case, but it violates the DO NOT CHANGE directive and risks unintended interactions with the carefully tuned dedup/prefix-removal balance.

---

## Failure 3: Smażona zielona fasolka → `DLA & OSOB`

**Expected:** `Smażona zielona fasolka`
**Got:** `DLA & OSOB`

### Root Cause Analysis

`DLA & OSOB` is OCR-corrupted Polish serving notation: `DLA 4 OSÓB` ("FOR 4 PEOPLE"), where OCR read `4` as `&` and `Ó` as `O`.

The metadata pattern `/^DLA\s+\d/i` (line 59) requires a digit after `DLA`. With `&` in place of `4`, the pattern does not match. `DLA & OSOB` then:
1. Passes all hard filters
2. Receives the ALL_CAPS bonus (+0.08)
3. In the multi-title guard (line 669), triggers `allCapsSelected.length === 1` → collapses to highest-scoring → `DLA & OSOB` beats `Smażona zielona fasolka` due to the ALL_CAPS bonus and position factor

The bilingual detection correctly suppresses `GREEN BEANS BORKEUM` — that part works. The failure is purely that `DLA & OSOB` isn't recognized as metadata.

### Fix: OCR-resilient serving-size metadata pattern

Replace the narrow digit-dependent pattern with one that recognizes the full structure of Polish serving-size notation: `DLA` + any short token (OCR-corrupted count) + a serving-unit word like `OSOB`/`OSÓB`/`PORCJI`.

Also add a broader pattern that catches `DLA` followed by any single non-word character (common OCR substitution for digits).

**Before (line 59):**
```typescript
/^DLA\s+\d/i,
```

**After:**
```typescript
/^DLA\s+\d/i,
// OCR-resilient: "DLA" + any token + serving-unit word (handles DLA & OSOB, DLA § OSOB, etc.)
/^DLA\s+\S+\s+OSOB/i,
// OCR-resilient: "DLA" + single non-alphanumeric char (common digit→symbol OCR error)
/^DLA\s+[^a-zA-Z0-9\s]\s/i,
```

**Why this works:**
- `DLA & OSOB` → matches `/^DLA\s+\S+\s+OSOB/i` (the `\S+` swallows `&`, then `OSOB` matches)
- `DLA 4 OSÓB` → still matches the original `/^DLA\s+\d/i` pattern
- `DLA § OSOB` → matches `/^DLA\s+[^a-zA-Z0-9\s]\s/i` (hypothetical OCR corruption)
- `DLA 6 OSOB` → matches original pattern

**Safety analysis:**
- Could a legitimate recipe title start with `DLA`? In Polish, `DLA` means "for" — theoretically possible (e.g., `DLA PIOTRKA` = "for Piotr"), but:
  - `/^DLA\s+\S+\s+OSOB/i` requires the third word to be `OSOB*` — no recipe name contains this
  - `/^DLA\s+[^a-zA-Z0-9\s]\s/i` requires a non-alphanumeric second token — no recipe name has this
- Neither pattern is over-broad. They target specific OCR corruption of a specific metadata format.

---

## Summary of Changes

| # | Change | Location | Lines added | Risk | Fixes |
|---|--------|----------|-------------|------|-------|
| 1 | Breadcrumb filter (2+ slashes) | `passesHardFilters` | ~2 | Very low | Failure 1 Bug A |
| 2 | Mid-word casing garble check | `isLikelyGarbled` | ~4 | Very low | Failure 1 Bug B |
| 3 | Metadata continuation suppression | `buildCandidates` | ~10 | Low | Failure 2 |
| 4 | OCR-resilient DLA metadata pattern | `METADATA_PATTERNS` | ~2 | Very low | Failure 3 |

**Total: ~18 lines of new code across 3 functions and 1 constant.**

### What is NOT changed:
- The dedup logic (DO NOT CHANGE directive respected)
- The structural heading selection
- The scoring formula or bonuses
- The bilingual detection logic (its false trigger is prevented by the breadcrumb filter upstream)
- The multi-title guard
- The capsCoalesced merge pass (working correctly)
- Any embedding or similarity logic

### Expected accuracy: 11/11 (100%)
- KREM SELEROWY Z GORGONZOLA: breadcrumb filtered → real title not suppressed → wins (**fixed**)
- LABANEH BALLS WITH NIGELLA SEEDS: `BALLS` suppressed as metadata continuation → merged title wins (**fixed**)
- Smażona zielona fasolka: `DLA & OSOB` caught by expanded metadata pattern → mixed-case title wins (**fixed**)
- All 8 previously passing recipes: no changes to their code paths (verified by safety analysis above)

---

## Testing Plan

### New unit tests needed:

1. **Breadcrumb filter:** Input starting with `/ Section / Subsection\nREAL TITLE\n...`. Expected: `REAL TITLE` (breadcrumb filtered).

2. **Mid-word casing garble:** Input where only non-garbled candidates should survive after `UuIw` or `aBc` type lines are present. Expected: garbled lines do not win.

3. **Metadata continuation suppression:** Input with `MAKES 25 SOMETHING\nWORD\n<body>` where `WORD` appears in the title. Expected: `WORD` does not enter the candidate pool; the full title wins.

4. **OCR-corrupted DLA pattern:** Input containing `DLA & OSOB` and a mixed-case title. Expected: mixed-case title wins; `DLA & OSOB` filtered as metadata.

### Regression tests (existing, must still pass):
- All 20 existing `extractTitleWithEmbeddings` tests in `title-extractor.test.ts`
- Full corpus run via `title-loop.py` against all 11 real input files + 102 generated inputs

### Edge cases to verify manually:
- `SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)` — single slash, must NOT be filtered by breadcrumb rule
- `TITLE FIRST PART / SECOND PART` — single slash, must NOT be filtered
- Continuation merge still works for lines starting with `/` when preceded by another line

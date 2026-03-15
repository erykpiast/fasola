# Iteration 15 — Improvement Plan

## Overview

Two failures, two distinct root causes, but a shared theme: the algorithm's structural-heading machinery is too rigid for OCR layouts that deviate from the "single ALL_CAPS line = title" assumption. The fixes below are targeted but non-trivial — each addresses a design gap rather than patching a symptom.

**Accuracy trajectory:** 14 → 81.8% (regression from 98.1% at iter 13, caused by corpus expansion to 11 recipes exposing pre-existing gaps). The two failures here are new test cases, not regressions.

---

## Failure 1: LABANEH BALLS WITH NIGELLA SEEDS

**Expected:** `LABANEH BALLS WITH NIGELLA SEEDS`
**Got:** `WITH NIGELLA + SEEDS`

### Root Cause Analysis

Two compounding issues:

1. **3-line join ceiling** — The title spans 4 OCR lines (`LABANEH` / `BALLS` / `WITH NIGELLA` / `SEEDS`). `buildCandidates` generates joins of up to 3 consecutive lines, so the full title is never in the candidate pool. The best candidate covering the start is the 3-line join `LABANEH BALLS WITH NIGELLA` (position 0).

2. **Dedup "shorter wins" destroys the 3-line join** — `WITH NIGELLA` (single, position 2) is a substring of `LABANEH BALLS WITH NIGELLA`. The dedup rule keeps the shorter form, eliminating the only candidate that captures the dish name. After dedup, only `WITH NIGELLA` and `SEEDS` survive, producing `WITH NIGELLA + SEEDS`.

The existing continuation-character pre-merge (`/^[/&+:(]/`) doesn't help because `BALLS`, `WITH NIGELLA`, and `SEEDS` don't start with continuation punctuation — they're just OCR-fragmented words of a single heading.

### Proposed Fix: Short ALL_CAPS Line Merge Pass

Add a **pre-processing pass** in `buildCandidates`, before the existing continuation-character merge, that collapses consecutive short ALL_CAPS lines into single logical lines. The insight: when a recipe page has a sequence of 2+ consecutive ALL_CAPS lines where each line has ≤2 words and ≤25 characters, they are almost certainly fragments of a single heading broken by OCR line detection.

**Algorithm:**

```
Input lines (after burst skip):
  LABANEH           (ALL_CAPS, 1 word, 7 chars)
  BALLS             (ALL_CAPS, 1 word, 5 chars)
  WITH NIGELLA      (ALL_CAPS, 2 words, 12 chars)
  SEEDS             (ALL_CAPS, 1 word, 5 chars)
  Essential to...   (mixed-case, long — breaks the run)

After short-caps merge:
  LABANEH BALLS WITH NIGELLA SEEDS   (merged, position 0)
  Essential to...                     (unchanged)
```

**Merge criteria for each line in the run:**
- `isAllCaps(line)` is true
- `wordCount(line) <= 2`
- `line.length <= 25`
- NOT a section label (`isSectionLabel` returns false)
- NOT a metadata line (`looksLikeMetadata` returns false)

**Run termination:** The run breaks when a line fails any criterion, or is empty, or when the accumulated merged text exceeds 80 characters (the existing `passesHardFilters` length cap).

**Where in the code:** In `buildCandidates`, after the `burstEnd` computation and before the continuation-character pre-merge loop. The merged lines feed into the existing continuation merge and candidate generation unchanged.

**Before:**
```typescript
// Pre-merge continuation lines: a line starting with /&+:( ...
const mergedLines: Array<{ text: string; index: number }> = [];
for (let i = burstEnd; i < nonEmptyLines.length; i++) {
```

**After:**
```typescript
// Pre-merge consecutive short ALL_CAPS lines (OCR-fragmented headings)
const capsCoalesced: Array<{ text: string; index: number }> = [];
let i = burstEnd;
while (i < nonEmptyLines.length) {
  const line = nonEmptyLines[i];
  if (
    isAllCaps(line.text) &&
    wordCount(line.text) <= 2 &&
    line.text.length <= 25 &&
    !isSectionLabel(line.text) &&
    !looksLikeMetadata(line.text)
  ) {
    // Start a run of short ALL_CAPS lines
    let merged = line.text;
    const startIndex = line.index;
    let j = i + 1;
    while (j < nonEmptyLines.length) {
      const next = nonEmptyLines[j];
      if (
        isAllCaps(next.text) &&
        wordCount(next.text) <= 2 &&
        next.text.length <= 25 &&
        !isSectionLabel(next.text) &&
        !looksLikeMetadata(next.text) &&
        (merged + " " + next.text).length <= 80
      ) {
        merged += " " + next.text;
        j++;
      } else {
        break;
      }
    }
    if (j > i + 1) {
      // Merged 2+ lines into one
      capsCoalesced.push({ text: merged, index: startIndex });
      i = j;
      continue;
    }
  }
  capsCoalesced.push(line);
  i++;
}

// Pre-merge continuation lines: a line starting with /&+:( ...
const mergedLines: Array<{ text: string; index: number }> = [];
for (let k = 0; k < capsCoalesced.length; k++) {
  // (rest of existing logic, but iterating over capsCoalesced instead of nonEmptyLines starting at burstEnd)
```

**Why this works:**
- `LABANEH BALLS WITH NIGELLA SEEDS` enters the pool as a single candidate at position 0.
- It qualifies as a structural heading (ALL_CAPS, 5 significant words ≥4 letters).
- No substring fragment can beat it in dedup because the full title is a single candidate now.
- The 3-line join ceiling becomes irrelevant for this case — the problem is solved at the source.

**Safety considerations:**
- The merge only fires for ALL_CAPS short lines. Mixed-case lines (which could be separate paragraphs) are never merged.
- Section labels like `INGREDIENTS` or `SKŁADNIKI` break the run, preventing "TITLE INGREDIENTS NEXT_TITLE" merges.
- The 80-char cap matches `passesHardFilters` and prevents runaway merges of many short lines.
- Existing tests: `ARAYES\nSHRAK` (2 short ALL_CAPS lines) should still work — they'll be merged into `ARAYES SHRAK` even earlier, which is the correct result. The `FINNISH MILK FLATBREADS` + `FINNISH POTATO FLATBREADS` test has multi-word (>2 word) lines and body text between them, so no merge fires.

**Potential concern — CHLEBEK test:**
```
CHLEBEK Z WARZYWAMI I BOCZKIEM    (5 words — too many for merge)
WARZYWA I BOCZEK                  (3 words — too many for merge)
```
Both lines have >2 words, so they don't trigger the short-caps merge. Safe.

---

## Failure 2: Smażona zielona fasolka

**Expected:** `Smażona zielona fasolka`
**Got:** `GREEN BEANS BORKEUM`

### Root Cause Analysis

Two compounding issues:

1. **Structural bonus inaccessible to mixed-case titles** — `Smażona zielona fasolka` is the correct title at position 0 (mixed-case, Polish convention). `GREEN BEANS BORKEUM` at position 1 (ALL_CAPS, English+Korean romanization) receives the +0.08 ALL_CAPS bonus and +0.10 structural heading bonus, pushing it above the Polish title.

2. **Bilingual detection threshold too strict** — The guard at lines 451-472 checks whether the position-0 mixed-case candidate and a nearby ALL_CAPS candidate have cosine similarity > 0.4. For Polish ↔ Korean romanization ("BORKEUM" = 볶음 = stir-fry), MiniLM embeddings can't reliably achieve 0.4 because the word roots are completely unrelated across these language families.

### Proposed Fix: Position-Based Bilingual Layout Detection

Replace the embedding-similarity bilingual guard with a **layout-based heuristic** that doesn't depend on cross-lingual semantic similarity at all. The key insight: in multilingual cookbooks, the layout is deterministic:

```
Line 0: Primary title (native language, often mixed-case)
Line 1: Translation / romanization (often ALL_CAPS)
Line 2: Second script / additional translation (often filtered by garbled check)
```

When this layout is detected, the position-0 candidate should be strongly preferred regardless of embedding similarity between the two title forms.

**New heuristic — `isBilingualHeader`:**

The existing bilingual guard (lines 451-472) should be expanded with a second, independent trigger condition:

```
Trigger condition (NEW — layout-based, no embedding similarity required):
  1. There exists a mixed-case candidate at position 0 with wordCount ≥ 2
  2. There exists an ALL_CAPS candidate at position 1 or 2 with wordCount ≥ 2
  3. The mixed-case candidate at position 0 does NOT look like a section label
  4. The ALL_CAPS candidate is NOT a structural section label
  5. The two candidates share NO words in common (cross-lingual indicator —
     same-language titles like "Pierogi Ruskie" / "PIEROGI RUSKIE" would share words)
```

When triggered, suppress the ALL_CAPS candidate from `scoredForThreshold` (same as current bilingual guard behavior), preventing its bonuses from inflating the threshold and ensuring the mixed-case position-0 title wins.

**Before (existing guard):**
```typescript
let scoredForThreshold = scored;
const prePos0 = scored.find((s) => s.position === 0 && !isAllCaps(s.text));
if (prePos0) {
  const nearbyAllCaps = scored.filter(
    (s) => isAllCaps(s.text) && s.position >= 1 && s.position <= 2
  );
  const pos0Embedding = rawScored.find((r) => r.text === prePos0.text)?.embedding;
  if (pos0Embedding && nearbyAllCaps.length > 0) {
    const translationCandidates = nearbyAllCaps.filter((cap) => {
      const capEmbedding = rawScored.find((r) => r.text === cap.text)?.embedding;
      if (!capEmbedding) return false;
      return cosineSimilarity(pos0Embedding, capEmbedding) > 0.4;
    });
    // ... suppress translationCandidates
  }
}
```

**After (layout-based fallback added):**
```typescript
let scoredForThreshold = scored;
const prePos0 = scored.find((s) => s.position === 0 && !isAllCaps(s.text));
if (prePos0) {
  const nearbyAllCaps = scored.filter(
    (s) => isAllCaps(s.text) && s.position >= 1 && s.position <= 2
      && s.origin === "single"  // only single-line ALL_CAPS, not joins
  );
  const pos0Embedding = rawScored.find((r) => r.text === prePos0.text)?.embedding;

  let translationCandidates: typeof nearbyAllCaps = [];

  // Method 1: embedding similarity (existing — works for related languages)
  if (pos0Embedding && nearbyAllCaps.length > 0) {
    translationCandidates = nearbyAllCaps.filter((cap) => {
      const capEmbedding = rawScored.find((r) => r.text === cap.text)?.embedding;
      if (!capEmbedding) return false;
      return cosineSimilarity(pos0Embedding, capEmbedding) > 0.4;
    });
  }

  // Method 2: layout-based detection (NEW — works for distant languages)
  // If embedding similarity didn't find translations, check layout:
  // mixed-case ≥2 words at pos 0 + ALL_CAPS ≥2 words at pos 1-2 sharing no words
  if (translationCandidates.length === 0 && wordCount(prePos0.text) >= 2) {
    const pos0Words = new Set(
      prePos0.text.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    );
    translationCandidates = nearbyAllCaps.filter((cap) => {
      if (wordCount(cap.text) < 2) return false;
      const capWords = cap.text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      // No significant words in common → likely different languages
      const hasCommonWord = capWords.some(w => pos0Words.has(w));
      return !hasCommonWord;
    });
  }

  if (translationCandidates.length > 0) {
    // (existing suppression logic, unchanged)
    scoredForThreshold = scored.filter((s) => {
      const sLower = s.text.toLowerCase();
      return !translationCandidates.some((t) => sLower.startsWith(t.text.toLowerCase()));
    });
  }
}
```

**Why this works for `Smażona zielona fasolka`:**
- Position 0: `Smażona zielona fasolka` (mixed-case, 3 words)
- Position 1: `GREEN BEANS BORKEUM` (ALL_CAPS, 3 words, single-line)
- No words in common (Polish vs English+Korean)
- Layout trigger fires → `GREEN BEANS BORKEUM` suppressed from threshold
- `Smażona zielona fasolka` wins on position

**Why this is safe for existing tests:**

- **Faszerowana papryka test:** Position 0 = `Faszerowana papryka` (mixed-case), Position 1 = `PAPRIKA GYERAN-JJIM` (ALL_CAPS). Words: {faszerowana, papryka} vs {paprika, gyeran-jjim}. "papryka" vs "paprika" — these don't match exactly as strings. The layout guard fires and suppresses the ALL_CAPS line, which is the **already correct** behavior (previously achieved via embedding similarity). No regression.

- **CHOCOLATE CAKE test:** `CHOCOLATE CAKE` is at position 0 and is itself ALL_CAPS, so `prePos0` (looking for mixed-case at position 0) is null. Guard doesn't fire. Safe.

- **ARAYES SHRAK test:** Both lines are ALL_CAPS. No mixed-case at position 0. Guard doesn't fire. Safe.

- **FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS test:** Both are ALL_CAPS. No mixed-case at position 0. Guard doesn't fire. Safe.

- **CHLEBEK Z WARZYWAMI I BOCZKIEM test:** ALL_CAPS at position 0. No mixed-case at position 0. Guard doesn't fire. Safe.

- **Pierogi Ruskie test:** Position 0 = `Składniki` (section label, filtered by hard filters). Position 1 = `Pierogi Ruskie`. There's no mixed-case candidate at position 0 that passes filters. Guard doesn't fire. Safe.

**Potential concern — false positives on single-language pages:**
Could a page have a mixed-case title at line 0 and a different ALL_CAPS recipe title at line 1? This would be unusual layout — recipe books don't typically put two different recipe titles on consecutive lines in the same language. The "no words in common" check provides additional safety: if the titles are in the same language, they'd likely share at least a preposition or article. But to be extra safe, we restrict this to `origin === "single"` for the ALL_CAPS candidates (not joins) since joins of disparate content could spuriously match.

---

## Summary of Changes

| Change | Files | Risk | Impact |
|--------|-------|------|--------|
| Short ALL_CAPS line merge pass | `title-extractor.ts` (~30 lines in `buildCandidates`) | Low — only fires on ≤2 word ALL_CAPS lines | Fixes LABANEH; enables future 4+ line titles |
| Layout-based bilingual detection | `title-extractor.ts` (~15 lines in bilingual guard) | Low — fallback, only fires when embedding guard doesn't | Fixes Smażona zielona fasolka; covers all language pairs |

**Neither change modifies:**
- The dedup logic (explicitly warned not to change)
- The structural heading selection
- The scoring formula
- The multi-title guard
- Any hard filters

**Expected accuracy:** 11/11 (100%) — both failures addressed without regressions to existing 9 passing cases.

---

## Testing Plan

### New unit tests needed:

1. **4-line ALL_CAPS title merge:** Input with `LABANEH\nBALLS\nWITH NIGELLA\nSEEDS\n<body text>`. Expected: `LABANEH BALLS WITH NIGELLA SEEDS`.

2. **Short-caps merge doesn't merge across section labels:** Input with `WORD ONE\nINGREDIENTS\nWORD TWO`. Expected: merge does NOT happen (INGREDIENTS breaks the run).

3. **Short-caps merge respects word-count limit:** Input with `THREE WORD LINE\nANOTHER LINE`. Expected: no merge (first line has 3 words, exceeds ≤2 limit).

4. **Layout bilingual detection with no shared words:** Input with `Mixed Case Title\nALL CAPS DIFFERENT\n<body>`. Expected: mixed-case title wins.

5. **Layout bilingual detection skipped when words overlap:** Input with `Apple Pie Recipe\nAPPLE PIE DELUXE\n<body>`. Expected: normal scoring (shared words "apple", "pie" prevent bilingual suppression).

### Regression tests (existing, must still pass):
- All 15 existing `extractTitleWithEmbeddings` tests in `title-extractor.test.ts`
- Full corpus run via `title-loop.py` against all 11 input files

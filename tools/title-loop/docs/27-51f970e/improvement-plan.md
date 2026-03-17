# Iteration 28 — Improvement Plan

**Status:** Draft
**Date:** 2026-03-17
**Based on:** Iteration 27 feedback (11 failures, all generated files)

## Problem Statement

Iteration 27 scores 90.1% overall (100% on real files, plateau on generated). The 11 remaining failures cluster into 4 patterns that share a common root: the pipeline rejects or misranks the true title line, then falls back to garbage. The current codebase is ~1500 lines of layered heuristics. Each fix risks regressions in other branches of the logic. The patterns are well-understood and each has a targeted fix that doesn't require architectural changes.

## Goals

- Fix all 4 failure patterns without regressing existing passing tests
- Keep changes minimal and targeted — the architecture works, the edge cases don't

## Non-Goals

- Replacing the embedding-based approach (it works well for 90%+ of cases)
- Reducing overall code complexity (a separate effort)
- Handling new patterns not seen in iteration 27

---

## Pattern 1: OCR digit-for-letter corruption on title line (5 cases)

**Cases:** Braised Cod with White Wine, Drożdże Sernik, Piernik z Śliwkami, Roasted Beet and Walnut Dip, Żurek Krakowski

**Root cause:** `repairOcrText` only repairs words found in `FOOD_DICTIONARY`. When a corrupted word like `Bra1sed` or `D1p` has no dictionary match, it passes through unrepaired. The corrupted text then either:
- Gets a low embedding score (MiniLM doesn't understand `Bra1sed`) and loses to later candidates
- Falls below the threshold entirely, resulting in empty output
- Gets beaten by garbage text that happens to embed slightly better

**Fix: Blind OCR repair for early-position candidates**

**Cross-iteration context:** Iteration 24 introduced dictionary-guided OCR repair (`repairOcrWord` checks `FOOD_DICTIONARY`), and iteration 26 expanded the dictionary with ~50 common title words (`with`, `dip`, `pie`, etc.). Despite these expansions, 5 OCR failures persist — the dictionary approach has diminishing returns because every new corrupted word requires adding its clean form to the dictionary. The blind approach is complementary, not a replacement: dictionary-guided repair continues to run for all candidates, but for the first few lines where positional evidence is strong, we also generate a blind-repaired variant as an additional candidate. This gives the embedding scorer a clean version to work with even when the dictionary misses a word.

The existing `normalizeOcrTitle` already does blind digit→letter substitution (1→I, 4→A, 5→S, 0→O) but only as post-processing on the *winner*. The fix is to apply the same blind repair *before* embedding, specifically for candidates in the first few lines where positional evidence is strong.

### Implementation

In `buildCandidates`, after constructing each single-line candidate from the first 3 non-empty lines, generate a second "OCR-repaired" variant using blind substitution (the same logic as `normalizeOcrTitle` step 2). If the repaired text differs from the original AND passes hard filters, add it as an additional candidate at the same position. This gives the embedding scorer a clean version to work with.

```typescript
// In buildCandidates, after adding the single-line candidate:
if (line.index <= 5 && OCR_ARTIFACT_PATTERN.test(singleText)) {
  const blindRepaired = applyBlindOcrRepair(singleText);
  if (blindRepaired !== singleText && passesHardFilters(blindRepaired)) {
    const norm = blindRepaired.toLowerCase();
    if (!seen.has(norm)) {
      seen.add(norm);
      candidates.push({ text: blindRepaired, position: line.index, origin: "single" });
    }
  }
}
```

Extract the blind substitution logic from `normalizeOcrTitle` into a reusable `applyBlindOcrRepair` function. This function applies:
- `1` → `I` (in ALL_CAPS) or `l`/`i` (in mixed case, context-dependent)
- `4` → `A`
- `5` → `S`
- `0` → `O` (when adjacent to letters)

**Why this works:** The true title at line 1 with `Bra1sed Cod w1th Wh1te W1ne` becomes `Braised Cod with White Wine` after blind repair. This clean version embeds well and gets a high title similarity score. The original corrupted version also stays in the pool as a fallback. The position bonus for early candidates ensures the repaired version outscores garbage text later in the file.

**Risk:** Blind repair could create false words (e.g., `H1GH` → `HIGH` when the original was a code). Mitigated by limiting to the first 5 lines (title region) and by requiring the repaired text to pass all hard filters.

---

## Pattern 2: Category/section header precedes the title (3 cases)

**Cases:** Halibut with Saffron Cream Sauce, Roasted Asparagus with Parmesan, Ogórkowa Zupa

**Root cause:** Two sub-problems:

1. **After skipping a section header, the first-after-preamble bonus fires but isn't decisive enough.** The bonus (+0.08 to +0.12) can be outweighed by a longer candidate deeper in the file that has higher embedding similarity. For example, a description sentence about halibut may embed closer to "recipe title" than the actual title because it contains more food-related words.

2. **Pipe-separated metadata lines (`Lato | Zupy | DLA 4 OSÓB | ...`) are filtered by the existing `text.includes(" | ")` hard filter, BUT the individual segments after splitting are not.** When the pipe-separated line is filtered, the next line should be the title. However, if the pipe line contains segments that individually pass hard filters (e.g., `Lato` as a standalone word — wait, that's filtered by word length. Actually the pipe line IS already filtered. The issue is more subtle: the metadata line gets filtered, but the *next* line (the actual title) doesn't get the first-after-preamble bonus because there's other content between the metadata and the title that also passes as candidates.

**Fix: Strengthen post-header title promotion**

**Cross-iteration context:** Iteration 24 introduced the first-after-preamble bonus (+0.08), and iteration 26 strengthened it to +0.12 for section-label preambles with a combined cap of +0.15. Despite this, the 3 cases here still fail because the existing bonus requires ALL preceding lines to be filtered/empty — it doesn't fire when the section header is at position N-1 but an unfiltered line exists at position N-2. The direct-successor bonus below addresses this gap by checking only the immediately preceding line, not the entire preamble. The two bonuses are complementary: first-after-preamble fires when the entire preamble is filtered; direct-successor fires when only the immediately preceding line is a header. They share the existing `maxPositionalBoost` cap of +0.15, so they cannot over-boost together.

The first-after-preamble bonus currently checks whether ALL preceding lines were filtered. If any non-filtered line exists before the first candidate, the bonus doesn't fire. The fix: extend the bonus to fire when the *immediately preceding* line (not all preceding lines) was a section label or metadata, regardless of what came before that.

### Implementation

Add a "direct-successor" bonus in the scoring pass:

```typescript
// After existing first-after-preamble logic:
// Direct successor bonus: if the line immediately before this candidate
// is a section label, metadata, or pipe-separated line, this candidate
// is very likely the title that follows that header.
if (candidate.position > 0) {
  const prevLine = lines[candidate.position - 1]?.trim() ?? "";
  const prevIsHeader = isSectionLabel(prevLine) ||
                       looksLikeMetadata(prevLine) ||
                       prevLine.includes(" | ");
  if (prevIsHeader && candidateIndex <= 2) {
    candidate.score += 0.10;
    candidate.baseScore += 0.10;
    candidate.thresholdScore += 0.10;
  }
}
```

The `candidateIndex <= 2` guard prevents the bonus from firing on random mid-document candidates that happen to follow a metadata line.

**Why this works:** For `FISH & SEAFOOD\nHalibut with Saffron Cream Sauce`, the header is filtered, and "Halibut..." is the first candidate. It gets both the existing first-after-preamble bonus AND the direct-successor bonus, making it decisively outscore description text later in the file.

For `Lato | Zupy | DLA 4 OSÓB | ...\nOgórkowa Zupa`, the pipe line is filtered, and "Ogórkowa Zupa" immediately follows and gets the direct-successor bonus.

**Risk:** Could over-boost a line that follows a section header but isn't a title (e.g., a description). Mitigated by the `candidateIndex <= 2` guard and by requiring the candidate to have already passed all hard filters.

---

## Pattern 3: Multi-line split title (1 case)

**Case:** Lemon Herb Roasted Vegetables → currently extracts only `LEMON HERB ROASTED`

**Root cause:** The dedup rule "shorter wins when one is a substring of the other" kills the 2-line join `LEMON HERB ROASTED VEGETABLES` in favor of the single-line `LEMON HERB ROASTED`. The compound-title protection (`/ [+:&] /`) doesn't match because there's no separator — the second line is just a continuation word.

The caps coalescing logic in `buildCandidates` likely already merges `LEMON HERB RO45TED` + `VEGETABLES` into a single candidate. After OCR repair, both `LEMON HERB ROASTED` (single) and `LEMON HERB ROASTED VEGETABLES` (coalesced or 2-line join) enter the candidate pool. But dedup prefers the shorter one.

**Fix: Protect title continuations from dedup**

**Cross-iteration context:** Iteration 24 added compound-title dedup protection for titles containing explicit separators (` : ` or ` + `). That protection checks `/ [+:&] /` and is working correctly. This fix extends the same principle to multi-line joins that have no explicit separator — the continuation word is just appended. The two protections are complementary: iteration 24's handles compound titles with separators; this one handles title continuations without separators. Both coexist in the same dedup filter.

In the dedup step, when the longer candidate is a multi-line join (origin `"2-line"` or coalesced) and the shorter is its prefix, check if the suffix word(s) are food-related (in `FOOD_DICTIONARY` or `CATEGORY_SECTION_LABELS`). If so, prefer the longer form — it's a complete title, not an accidental substring match.

### Implementation

Modify the dedup filter:

```typescript
selected = selected.filter((a) => {
  const aLower = a.text.toLowerCase();
  if (/ [+:&] /.test(a.text)) return true;
  return !selected.some((b) => {
    if (b === a) return false;
    if (b.text.length >= a.text.length) return false;
    if (!aLower.includes(b.text.toLowerCase())) return false;

    // NEW: if `a` is a multi-line join and `b` is its prefix,
    // and the suffix contains a food-related word, keep `a`.
    if ((a.origin === "2-line" || a.origin === "3-line") &&
        aLower.startsWith(b.text.toLowerCase() + " ")) {
      const suffix = a.text.slice(b.text.length).trim();
      const suffixNorm = stripDiacritics(suffix.toLowerCase());
      if (CATEGORY_SECTION_LABELS.has(suffixNorm) ||
          FOOD_DICTIONARY.has(suffixNorm) ||
          suffix.split(/\s+/).some(w => FOOD_DICTIONARY.has(w.toLowerCase()))) {
        return false; // Don't remove `a` — its suffix is food-related
      }
    }

    return true;
  });
});
```

**Why this works:** `LEMON HERB ROASTED VEGETABLES` is a 2-line join. Its suffix `VEGETABLES` is in `CATEGORY_SECTION_LABELS`. The dedup rule now keeps the longer form.

**Risk:** Could keep overly long titles when a food word happens to follow. Mitigated by requiring the longer candidate to be a multi-line join (not a single line that happens to be longer) and by the existing word-count limit (≥8 words already filtered by hard filters).

---

## Pattern 4: Previous-page content before the title (2 cases)

**Cases:** Mushroom Risotto, Peach Cobbler

**Root cause:** The file starts with instructions/ingredients from the end of a previous recipe. The `findBurstEnd` function's overflow detection looks for explicit markers (`PREVIOUS RECIPE OVERFLOW`, `CORRUPTED SECTION`, etc.) but the test cases may not use those exact markers. When the spillover isn't detected, the extractor treats the entire file as one recipe and picks the first "title-shaped" line it finds — which may be a different recipe's title embedded in the spillover text, or an instruction line.

The existing `isTitleAbsentPage` check (requires first 3 non-empty lines to be ingredients/instructions/prose) should catch many of these cases. The feedback says it returns `CARPACCIO DI PESCE SPADA` for Mushroom Risotto — this is a different recipe's ALL_CAPS title in the spillover. The title-absent guard filters by `rawScore >= 0.10` and `position <= 2`, but the foreign recipe title may be at a low position and have a good rawScore.

**Fix: Extend spillover detection and corroboration**

Two changes:

1. **Broaden `findBurstEnd` to detect implicit spillover:** When the first 3+ non-empty lines are a mix of ingredients, instructions, and body prose (not preceded by any title-shaped line), and then a blank-line gap or visual separator appears, skip past it. This is already partially handled by `isTitleAbsentPage` and the prose-prologue skip in `findBurstEnd`.

   **Cross-iteration context:** Iteration 21 deliberately chose separate thresholds: 3 for prose-prologue detection (lowercase body text) and 5 for cooking-instruction detection (imperative verb lines). The reasoning was that cooking instructions are more likely to appear legitimately at the start of a file (e.g., a recipe that opens with "Preheat oven...") so a higher threshold avoids false skips. However, the 2 failing cases here have short spillover blocks (3-4 instruction lines from a previous recipe) that fall under the threshold of 5. Lowering to 3 is safe here because iteration 26 improved `findBurstEnd`'s post-skip logic to look for structural markers (≥2 blank lines, separators, ALL_CAPS headings) before resuming — so even if we skip too eagerly, we stop at the first structural signal. If regressions appear, 4 is a viable middle ground.

2. **Strengthen corroboration for multi-recipe pages:** When multiple ALL_CAPS titles survive to the multi-title guard, and one of them has zero vocabulary overlap with the rest of the document (no content word appears elsewhere), it's from a different recipe. The existing `passesCorroboration` function handles this, but it only runs when `allCapsInScored.length >= 2` in the pre-threshold filter. Ensure it also runs in the multi-title guard's corroboration step, and make the corroboration check consider the **post-spillover** portion of the document only (lines after `findBurstEnd`).

### Implementation

```typescript
// In findBurstEnd: lower the cooking-instruction prologue threshold
// from 5 to 3 consecutive lines
if (j >= 3) {  // was: j >= 5
  i = j;
}
```

For the corroboration improvement, modify `passesCorroboration` to accept an optional `startLine` parameter:

```typescript
function passesCorroboration(
  text: string,
  position: number,
  allLines: string[],
  startLine: number = 0  // NEW: only check corroboration against lines after this
): boolean {
  // ... existing logic, but iterate from startLine instead of 0
}
```

Then in the multi-title guard, pass `burstEnd` as `startLine` so that vocabulary from the spillover region doesn't count as corroboration for a spillover recipe title.

**Why this works:** `CARPACCIO DI PESCE SPADA` has no vocabulary support in the Mushroom Risotto recipe body (no mention of "carpaccio", "pesce", or "spada"). With corroboration checking only the post-spillover region, it gets filtered. `MUSHROOM RISOTTO` (if it appears as a candidate) has vocabulary support ("mushroom" in ingredients, "risotto" in instructions).

**Risk:** Lowering the instruction-prologue threshold from 5 to 3 could skip legitimate title regions that happen to start with 3 instruction-like lines. Mitigated by the fact that the skip only fires when ALL of the first lines match instruction patterns — a title mixed in would break the streak.

---

## Implementation Order

1. **Pattern 1 (OCR blind repair)** — Highest impact (5 cases). Extract `applyBlindOcrRepair` from `normalizeOcrTitle`, call it in `buildCandidates` for early-position candidates.

2. **Pattern 3 (multi-line dedup fix)** — Simplest change (1 case, dedup rule tweak). Low regression risk.

3. **Pattern 2 (post-header bonus)** — Medium complexity (3 cases). New bonus in scoring pass. Test carefully against existing section-header cases.

4. **Pattern 4 (spillover detection)** — Highest regression risk (2 cases). Changes to `findBurstEnd` and corroboration affect all test cases. Run full eval after each sub-change.

## Testing Strategy

- Run the full eval suite after each pattern fix
- For each fix, verify that the specific failing cases now pass
- Watch for regressions in the corresponding pattern category (e.g., OCR repair changes could affect other OCR cases)
- The eval_only.py script should be used to validate without committing iteration state

## Files to Modify

- `lib/text-classifier/title-extractor.ts` — all 4 fixes
- `lib/text-classifier/food-dictionary.ts` — possibly add missing food words discovered during Pattern 1 work (only if specific words are needed for dictionary-based repair)

## Open Questions

1. **Pattern 1 scope:** Should blind OCR repair apply to ALL candidates or only the first N lines? First 5 lines is proposed but could be tuned. The dictionary-guided repair (iterations 24-26) continues to run for all candidates regardless.
2. **Pattern 2 bonus stacking:** The direct-successor bonus stacks with the first-after-preamble bonus, but the existing `maxPositionalBoost` cap (0.15) limits the total. This is consistent with iteration 26's design.
3. **Pattern 4 threshold:** Is lowering instruction-prologue skip from 5→3 too aggressive? Iteration 21 chose 5 deliberately to avoid skipping legitimate recipe openings. Iteration 26's improved post-skip structural detection mitigates this risk. Try 3 first; fall back to 4 if regressions appear.

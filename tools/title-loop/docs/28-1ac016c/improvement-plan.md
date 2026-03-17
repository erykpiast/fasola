# Iteration 29 — Improvement Plan

**Status:** Draft
**Date:** 2026-03-17
**Based on:** Iteration 28 feedback (11 failures, all generated files)

## Overview

Iteration 28 implemented all 4 fixes from the iteration 27 plan (blind OCR repair, direct-successor bonus, multi-line dedup protection, spillover threshold lowering). The score held at 90.1% — the same 11 failures persist. By reading the actual test files and tracing through the code, this plan identifies why each fix failed and proposes corrected approaches.

## Problem Statement

The iteration 27 plan correctly identified the 4 failure patterns but the implementations had bugs or gaps:

1. **Blind OCR repair maps `1→l` instead of `1→i`** — The mixed-case path in `applyBlindOcrRepair` always substitutes `l`, producing garbled text like `Bralsed Cod wlth Whlte Wlne` instead of `Braised Cod with White Wine`.
2. **Direct-successor bonus ignores blank lines** — The bonus checks `lines[position - 1]`, but in both the Halibut and Ogórkowa Zupa files, there's a blank line between the header and the title. The bonus never fires. Note: the section headers (`VEGETABLES`, `FISH & SEAFOOD`) ARE already correctly filtered by `passesHardFilters` → `isSectionLabel` (English food categories were added to `SECTION_LABELS` in iteration 22, lines 162-166). The issue is purely that the direct-successor bonus doesn't scan past blank lines to detect them as predecessor headers.
3. **Overflow marker regex doesn't match actual test marker** — `[CORRUPTED TEXT FROM PREVIOUS PAGE - PARTIAL RECIPE]` fails to match the regex `PREVIOUS\s+(RECIPE|PAGE)\s+(OVERFLOW|CONTENT)` because the text says `PREVIOUS PAGE` followed by `- PARTIAL RECIPE`, not `OVERFLOW` or `CONTENT`.
4. **`findBurstEnd` misses non-consecutive instruction prologues** — The Mushroom Risotto file alternates cooking instructions (`Reduce heat...`, `Season with...`) with prose (`creamy but still al dente...`), breaking the consecutive-instruction count at j=1.

## Goals

- Fix the root causes identified above, not just increase bonuses or thresholds
- Fix all 11 failures without regressing existing passing tests
- Keep changes targeted — the architecture works, the edge-case handling has specific bugs

## Non-Goals

- Replacing the embedding-based approach
- Reducing overall code complexity
- Handling new patterns not seen in iterations 27-28

---

## Fix 1: Dual-variant blind OCR repair (5 cases + 1 case)

**Affects:** Braised Cod with White Wine, Drożdże Sernik, Piernik z Śliwkami, Roasted Beet and Walnut Dip, Żurek Krakowski, Kopytka z Pieczarkami Leśnymi

### Root Cause

`applyBlindOcrRepair` in mixed-case mode has:
```typescript
.replace(/(?<=[a-zà-ż])1/g, "l")
.replace(/1(?=[a-zà-ż])/g, "l")
```

This always maps `1→l`. For recipe text, `1→i` is correct far more often:
- `Bra1sed` → should be `Braised` (i), not `Bralsed` (l)
- `w1th` → should be `with` (i), not `wlth` (l)
- `Wh1te` → should be `White` (i), not `Whlte` (l)
- `W1ne` → should be `Wine` (i), not `Wlne` (l)
- `Sern1k` → should be `Sernik` (i), not `Sernlk` (l)

The ALL_CAPS path (`1→I`) works because uppercase `I` and `L` are visually similar and `I` is the correct character for most recipe words. The mixed-case path needs the same correctness.

Additionally, `Kopytka z Pieczarkami Leśnymi` has erratic casing (`KoPyTka`) that doesn't trigger the ALL_CAPS path and confuses the mixed-case repair.

### Fix

**Part A: Generate both `i` and `l` variants as separate candidates.**

Instead of choosing one substitution, generate two candidates — one with `1→i` and one with `1→l`. The embedding scorer will pick the one that embeds as a better title. This avoids needing to guess which letter is correct.

```typescript
// In buildCandidates, replace the single blind-repair block with:
if (line.index <= 5 && OCR_ARTIFACT_PATTERN.test(line.text)) {
  const variants = generateBlindOcrVariants(singleText);
  for (const variant of variants) {
    if (variant !== singleText && passesHardFilters(variant)) {
      const norm = variant.toLowerCase();
      if (!seen.has(norm)) {
        seen.add(norm);
        candidates.push({ text: variant, position: line.index, origin: "single" });
      }
    }
  }
}
```

`generateBlindOcrVariants` returns an array of up to 2 variants:
1. `i`-variant: `1→i` between lowercase letters, `¡→i`, `€→e`
2. `l`-variant: `1→l` between lowercase letters (the current behavior)

For ALL_CAPS text, only one variant (`1→I`) is needed (current behavior is correct).

**Part B: Normalize erratic casing before repair.**

For the Kopytka case (`KoPyTka z P¡eczarkami Leśnymi`), add a casing normalization step that detects erratic mixed-case (neither title-case nor ALL_CAPS) and normalizes to title-case before OCR repair. A line has "erratic casing" when individual words have uppercase letters in non-initial positions (like `KoPyTka` where `P`, `T`, `k` break the pattern).

```typescript
function hasErraticCasing(text: string): boolean {
  return text.split(/\s+/).some(word => {
    if (word.length < 3) return false;
    if (isAllCaps(word)) return false;
    // Check for uppercase letters after position 0 that aren't part of known patterns
    // (e.g., McDonald's is OK, KoPyTka is not)
    const inner = word.slice(1);
    const upperInner = (inner.match(/[A-ZÀ-Ż]/g) || []).length;
    const lowerInner = (inner.match(/[a-zà-ż]/g) || []).length;
    return upperInner >= 2 && upperInner >= lowerInner * 0.3;
  });
}

function normalizeErraticCasing(text: string): string {
  return text.split(/(\s+)/).map(token => {
    if (/^\s+$/.test(token)) return token;
    if (isAllCaps(token)) return token;
    if (hasErraticCasing(token)) {
      // Normalize to title-case: first letter upper, rest lower
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    }
    return token;
  }).join("");
}
```

Apply this normalization as a pre-step before blind OCR repair for early-position candidates:

```typescript
if (line.index <= 5 && (OCR_ARTIFACT_PATTERN.test(line.text) || hasErraticCasing(line.text))) {
  let repairable = singleText;
  if (hasErraticCasing(repairable)) {
    repairable = normalizeErraticCasing(repairable);
  }
  const variants = generateBlindOcrVariants(repairable);
  // ... add variants as candidates
}
```

**Why this works:**
- `Bra1sed Cod w1th Wh1te W1ne` → `i`-variant: `Braised Cod with White Wine` (embeds perfectly as a title)
- `Drożdże Sern1k` → `i`-variant: `Drożdże Sernik` (correct)
- `KoPyTka z P¡eczarkami Leśnymi` → normalize: `Kopytka z P¡eczarkami Leśnymi` → repair `¡→i`: `Kopytka z Pieczarkami Leśnymi` (correct)

**Risk:** Generating extra candidates costs one additional embedding computation per variant. With the limit of first 5 lines, this adds at most 5 extra candidates — well within the 25-candidate cap. The embedding scorer naturally rejects wrong variants (e.g., `l`-variant `Bralsed` will score poorly).

---

## Fix 2: Direct-successor bonus should skip blank lines (3 cases)

**Affects:** Halibut with Saffron Cream Sauce, Roasted Asparagus with Parmesan, Ogórkowa Zupa

### Root Cause

The direct-successor bonus (added in iteration 28) checks `lines[candidate.position - 1]`. In both the Halibut/Asparagus and Ogórkowa Zupa files, there's a blank line between the header and the title:

```
FISH & SEAFOOD        ← header (line 0), already filtered by isSectionLabel
                      ← blank (line 1)
Halibut with ...      ← title (line 2), but lines[2-1] = blank
```

```
VEGETABLES            ← header (line 0), already filtered by isSectionLabel
                      ← blank (line 1)
Roasted Asparagus ... ← title (line 2), but lines[2-1] = blank
```

```
Lato | Zupy | ...     ← metadata (line 0), filtered by pipe check
                      ← blank (line 1)
OGÓRKOWA ZUPA         ← title (line 2), but lines[2-1] = blank
```

The section headers (`VEGETABLES`, `FISH & SEAFOOD`) are already correctly filtered by `passesHardFilters` → `isSectionLabel` — English food categories including `"vegetables"`, `"fish & seafood"` are in `SECTION_LABELS` (added in iteration 22, lines 162-166 of title-extractor.ts). The issue is purely that the direct-successor bonus doesn't scan past blank lines to detect these filtered lines as predecessor headers.

### Fix

Scan backward from the candidate to find the nearest non-empty line, instead of just checking position-1:

```typescript
for (let ci = 0; ci < scored.length && ci <= 2; ci++) {
  const candidate = scored[ci];
  if (candidate.position > 0) {
    // Scan backward past blank lines to find nearest non-empty preceding line
    let prevPos = candidate.position - 1;
    while (prevPos >= 0 && lines[prevPos].trim() === "") {
      prevPos--;
    }
    if (prevPos >= 0) {
      const prevLine = lines[prevPos].trim();
      const prevIsHeader =
        isSectionLabel(prevLine) ||
        looksLikeMetadata(prevLine) ||
        prevLine.includes(" | ");
      if (prevIsHeader) {
        candidate.score += 0.10;
        candidate.baseScore += 0.10;
        candidate.thresholdScore += 0.10;
      }
    }
  }
}
```

Note: `isSectionLabel` already handles both `VEGETABLES` and `FISH & SEAFOOD` (both are in `SECTION_LABELS`), so no additional `isCategorySectionLabel` or compound `&`-splitting logic is needed in the bonus check.

**Why this works:** For Halibut, the bonus scans back from position 2, skips blank line 1, finds `FISH & SEAFOOD` at position 0. `isSectionLabel("FISH & SEAFOOD")` → normalizes to `"fish & seafood"` → match in `SECTION_LABELS`. Bonus fires.

For Roasted Asparagus, scans back from position 2, skips blank line 1, finds `VEGETABLES` at position 0. `isSectionLabel("VEGETABLES")` → normalizes to `"vegetables"` → match. Bonus fires.

For Ogórkowa Zupa, scans back from position 2, skips blank line 1, finds `Lato | Zupy | DLA 4 OSÓB | ...` at position 0. `prevLine.includes(" | ")` matches. Bonus fires.

**Risk:** Scanning too far back could match a stale header. Mitigated by the existing `ci <= 2` guard (only top 3 candidates) and by requiring the previous non-empty line to actually be a header pattern.

---

## Fix 3: Broaden overflow marker detection (1 case)

**Affects:** Peach Cobbler

### Root Cause

The file starts with `[CORRUPTED TEXT FROM PREVIOUS PAGE - PARTIAL RECIPE]`. The `OVERFLOW_MARKERS` regex is:
```
/\b(PREVIOUS\s+(RECIPE|PAGE)\s+(OVERFLOW|CONTENT)|SPILLOVER|CONTINUATION|CORRUPTED\s+SECTION)\b/i
```

This expects:
- `PREVIOUS RECIPE OVERFLOW` or `PREVIOUS PAGE OVERFLOW` or `PREVIOUS PAGE CONTENT`
- `SPILLOVER`
- `CONTINUATION`
- `CORRUPTED SECTION`

The actual text has `CORRUPTED TEXT FROM PREVIOUS PAGE` — `CORRUPTED` is not followed by `SECTION`, and `PREVIOUS PAGE` is not followed by `OVERFLOW`/`CONTENT`.

### Fix

Broaden the regex to match more natural variations of corruption/spillover markers:

```typescript
const OVERFLOW_MARKERS = /\b(PREVIOUS\s+(RECIPE|PAGE)\b|SPILLOVER|CONTINUATION|CORRUPTED\s+(SECTION|TEXT)\b|PARTIAL\s+RECIPE)\b/i;
```

Changes:
- `PREVIOUS\s+(RECIPE|PAGE)` — no longer requires `OVERFLOW`/`CONTENT` after it. Any mention of "previous recipe" or "previous page" is an overflow signal.
- `CORRUPTED\s+(SECTION|TEXT)` — matches both `CORRUPTED SECTION` and `CORRUPTED TEXT`.
- `PARTIAL\s+RECIPE` — matches the `PARTIAL RECIPE` marker directly.

Also add a check for the common `[...]` bracket pattern used in generated files:

```typescript
// Additional overflow detection: lines that are fully bracketed annotations
// like "[CORRUPTED TEXT FROM PREVIOUS PAGE - PARTIAL RECIPE]"
if (/^\[.*\b(PREVIOUS|CORRUPTED|SPILLOVER|CONTINUATION)\b.*\]$/i.test(lines[k].text)) {
  // Treat as overflow marker — scan forward for boundary
  // ... same forward-scan logic as existing overflow handling
}
```

**Why this works:** `[CORRUPTED TEXT FROM PREVIOUS PAGE - PARTIAL RECIPE]` now matches via both `CORRUPTED\s+TEXT` and `PARTIAL\s+RECIPE` and the bracketed-annotation check. The forward scan finds the `---` separator at line 20 and sets `overflowEnd` to 21. `PEACH COBBLER` at line 22 is the first candidate after spillover.

**Risk:** Broader matching could trigger on legitimate recipe text that happens to contain "previous page" or "previous recipe" (e.g., "see previous recipe for sauce base"). Mitigated by: (1) `findBurstEnd` only scans early lines where overflow markers are expected; (2) the match requires multi-word phrases with word boundaries, not standalone words; (3) recipe body text containing "previous recipe" is extremely rare at position 0-2. The bracketed-annotation check is the safest path — `[...]` lines are clearly editorial annotations, not recipe content.

---

## Fix 4: Detect interleaved instruction/prose prologues (1 case)

**Affects:** Mushroom Risotto

### Root Cause

The file starts with:
```
Reduce heat and stir in the remaining stock, one ladle at a time, until the rice is   ← cooking instruction (Reduce)
creamy but still al dente, about 18-20 minutes. The risotto should flow slightly...    ← prose continuation
Season with salt and white pepper. Finish with butter and grated Parmigiano-Reggiano.  ← cooking instruction (Season/Finish)
```

`findBurstEnd`'s instruction-prologue check requires CONSECUTIVE lines matching `looksLikeCookingInstruction`. Line 0 matches (`Reduce`), but line 1 starts with `creamy` (lowercase, no cooking verb), breaking the streak at j=1. The threshold is j≥3, so no skip occurs.

The prose-prologue check also fails: line 0 starts with uppercase `R`, which doesn't match the lowercase-start requirement.

### Cross-iteration context: tension with iteration 21's separate thresholds

Iteration 21 deliberately chose SEPARATE thresholds for instruction and prose prologues:
- **Prose prologue:** 3 consecutive lowercase-starting body-text lines → skip
- **Cooking instruction prologue:** 5 consecutive instruction lines → skip (later lowered to 3 in iteration 27)

The reasoning (from iteration 21): "cooking instructions are more likely to appear legitimately at the start of a file (e.g., a recipe that opens with 'Preheat oven...') so a higher threshold avoids false skips." Iteration 27 lowered the instruction threshold from 5→3, noting that iteration 26's improved post-skip structural detection mitigated the risk.

This fix goes FURTHER by **unifying** the two checks so that a MIX of instruction and prose lines counts toward the threshold. This is strictly more permissive than either check alone: under the old logic, 1 instruction + 1 continuation + 1 instruction = no skip (neither check reaches 3 of its own type). Under the unified check, it would skip.

**Why this is safe despite the tension:** The unified check only counts lines that are clearly body content (cooking instructions with imperative verbs, or lines starting with lowercase letters). A legitimate title would break the streak because titles are capitalized (title-case or ALL_CAPS). The specific failure case (Mushroom Risotto) has spillover text that naturally alternates between instructions and continuations — this mixed pattern is the hallmark of mid-recipe body text, not recipe openings. If regressions appear in recipes that legitimately open with 3+ lines of instructions/prose, raising the threshold from 3→4 is a safe fallback.

### Fix

Replace the strict consecutive-instruction/prose checks with a unified "body-content prologue" detector that tolerates interleaving:

```typescript
// In findBurstEnd, replace the separate instruction-prologue and prose-prologue checks with:
if (i === 0) {
  let j = 0;
  while (j < lines.length) {
    const t = lines[j].text;
    const isInstruction = looksLikeCookingInstruction(t);
    const isProse = (
      /^[a-ząćęłńóśźż]/.test(t) ||
      t.endsWith(",") ||
      (t.endsWith(".") && wordCount(t) > 4)
    ) && wordCount(t) >= 4;
    // Also detect continuation lines: start lowercase or with a comma/conjunction
    const isContinuation = /^[a-ząćęłńóśźż]/.test(t) && wordCount(t) >= 2;

    if (isInstruction || isProse || isContinuation) {
      j++;
    } else {
      break;
    }
  }
  if (j >= 3) {
    i = j;
  }
}
```

The key change: instructions and prose lines are counted together. A cooking instruction followed by a prose continuation followed by another instruction all count toward the threshold.

**Why this works:** For Mushroom Risotto:
- Line 0: `Reduce heat and stir...` → `looksLikeCookingInstruction` matches → j=1
- Line 1: `creamy but still al dente...` → starts lowercase, 4+ words → `isContinuation` matches → j=2
- Line 2: `Season with salt...` → `looksLikeCookingInstruction` matches → j=3
- j≥3 → skip to line 3

After skipping, `CARPACCIO DI PESCE SPADA` is at line 4. But with the corroboration check using `burstEnd=3`, "carpaccio", "pesce", "spada" have no vocabulary support in the Mushroom Risotto content later in the file. The existing corroboration logic (already passing `burstEnd` from iteration 28) should now filter it out.

If `CARPACCIO DI PESCE SPADA` still survives (e.g., corroboration is too lenient), a supplementary check: when `isTitleAbsentPage` would have been true for lines 0..burstEnd (all instructions/prose), apply extra skepticism to ALL_CAPS titles in the early post-burst region that have zero vocabulary overlap with the document body after the first structural gap (2+ blank lines).

### `isTitleAbsentPage` interaction (resolving Open Question 3)

After the unified body-content prologue skip, `isTitleAbsentPage` may also fire (it checks the original first 3 lines, not post-burst lines). The correct behavior:

1. `findBurstEnd` runs first and returns `burstEnd`.
2. If `burstEnd > 0` (prologue was skipped), `isTitleAbsentPage` should check lines **starting from burstEnd**, not from 0. The prologue lines are already known to be body content — re-checking them via `isTitleAbsentPage` adds no information and could incorrectly suppress extraction of a real title that exists after the prologue.
3. **Implementation:** Pass `burstEnd` to `isTitleAbsentPage` and have it check `lines.slice(burstEnd)` instead of `lines.slice(0)`.

This resolves the tension between the two mechanisms: `findBurstEnd` skips known-bad preamble, and `isTitleAbsentPage` evaluates whether the POST-preamble content has a title.

**Risk:** The unified body-content check is more permissive — it could skip past a legitimate title that follows 3 lines of prose (e.g., a recipe that opens with a description). Mitigated by: (1) the prose/continuation checks require lowercase-start, which excludes title-case and ALL_CAPS titles; (2) the threshold is still 3 consecutive lines; (3) titles typically don't follow 3+ lines of body prose without a blank line or heading.

---

## Implementation Order

1. **Fix 1: Dual-variant OCR repair** — Highest impact (6 cases). Fixes the root cause of the largest failure cluster. Extract `generateBlindOcrVariants` with both `i` and `l` paths, add erratic-casing normalization.

2. **Fix 2: Direct-successor blank-line skip** — Small change to existing bonus logic. No new dependencies — `isSectionLabel` already handles English food categories. Low regression risk.

3. **Fix 3: Overflow marker regex** — Simple regex broadening. Isolated from other changes.

4. **Fix 4: Unified body-content prologue** — Highest regression risk. Changes `findBurstEnd` behavior for all files. Also requires passing `burstEnd` to `isTitleAbsentPage`. Run full eval after this change specifically.

## Testing Strategy

- Run the full eval suite after each fix (using `eval_only.py`)
- After Fix 1: expect Braised Cod, Drożdże Sernik, Piernik z Śliwkami, Roasted Beet, Żurek Krakowski, Kopytka to pass
- After Fix 2: expect Halibut, Roasted Asparagus, Ogórkowa Zupa to pass
- After Fix 3: expect Peach Cobbler to pass
- After Fix 4: expect Mushroom Risotto to pass
- Watch for regressions especially in: multi-recipe pages (Fix 4 changes burst detection), ALL_CAPS titles near section headers (Fix 2 changes bonus logic)

## Files to Modify

- `lib/text-classifier/title-extractor.ts` — all 4 fixes

## Open Questions

1. **Fix 1 variant count:** Should we cap the total number of OCR variants per line at 2 (one `i`, one `l`), or also generate a mixed variant where each `1` is resolved independently based on surrounding vowel/consonant context? Two variants is simpler and should suffice — the embedding scorer picks the better one.

2. **Fix 4 threshold tuning:** The unified body-content prologue uses a threshold of 3 (matching the existing prose-prologue threshold). If regressions appear in recipes that legitimately open with instruction/prose mixes, raising to 4 is a safe fallback. Monitor specifically for cases where a recipe's opening description or instruction is incorrectly skipped.

## References

- Iteration 28 feedback: `tools/title-loop/docs/28-1ac016c/feedback.md`
- Iteration 27 plan: `tools/title-loop/docs/27-51f970e/improvement-plan.md`
- Previous iteration history: `tools/title-loop/docs/iter.txt`
- Test fixtures: `tools/title-loop/input/*.generated.txt`

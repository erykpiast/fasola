# Iteration 30 → 31 Improvement Plan

**Status:** Draft
**Date:** 2026-03-17
**Baseline:** 91.9% combined accuracy (9 failures, all generated; 0 real failures)

---

## Overview

Iteration 30 implemented all 6 changes from the iter 29 plan (OCR repair, garbled detection, Polish verbs, positional bonus). Yet the same 9 failures persist. The iter 29 analysis was correct about downstream symptoms but missed the true root cause for 6 of 9 failures.

**The primary root cause is the continuation-line merge in `buildCandidates`** (lines 646–658). The merge treats `(` as a continuation character, so any parenthetical annotation line immediately following the title gets merged with it. The merged result fails the ≥8-word or ≥80-char hard filter, and the original single-line title is never generated as a candidate. All iter 29 fixes (OCR repair, cooking verb detection) were correct but never had a chance to fire because the title was destroyed before candidate generation.

---

## Root Cause Deep Dive

### The continuation merge bug (6/9 failures)

`buildCandidates` pre-merges continuation lines (lines 646–658):

```typescript
if (/^[/&+:(]/.test(nextText)) {
  mergedLines.push({ text: `${line.text} ${nextText}`, index: line.index });
  i++;  // ← skips nextText AND loses the original line.text as a standalone
  continue;
}
```

The regex `^[/&+:(]` is designed for real continuations like `SAFFRON WHEAT BUNS` + `/ COTTAGE CHEESE (VARIATION D)`. But it also matches the synthetic `(OCR CORRUPTION: ...)` annotation lines that the test generator places on line 3 of each generated file.

**Trace for "Braised Cod with White Wine":**

1. Non-empty lines: `[0] Bra1sed Cod w1th Wh1te W1ne`, `[1] (OCR CORRUPTION: digit for letter, hyphenation)`, `[2] lngredients:`
2. Continuation merge: line `[1]` starts with `(` → merged with `[0]`
3. Merged text: `Bra1sed Cod w1th Wh1te W1ne (OCR CORRUPTION: digit for letter, hyphenation)` (11 words)
4. `repairOcrText` → `Braised Cod with White Wine (OCR CORRUPTION: digit for letter, hyphenation)`
5. `passesHardFilters`: fails `words.length >= 8` check → rejected
6. The original standalone `Braised Cod with White Wine` was never generated

**Same mechanism for:** Roasted Beet and Walnut Dip, Drożdże Sernik, Piernik z Śliwkami, Żurek Krakowski (5 more cases, all have `(OCR CORRUPTION: ...)` on line 3).

### Remaining root causes (3/9 failures)

| Pattern | Case | Root cause |
|---------|------|-----------|
| C: Partial OCR normalization | Sole with Brown Butter and Capers | `sole` not in food dictionary; blind repair maps `01→oi` (i-variant) instead of `0→o, 1→l` (l-variant). No annotation merge issue — file has no `(OCR ...)` line. |
| D: Erratic casing + `¡` | Kopytka z Pieczarkami Leśnymi | No merge issue (line 2 is regular text). The erratic-casing normalization + blind `¡→i` repair should produce `Kopytka z Pieczarkami Leśnymi` as a candidate. Issue is downstream: the cooking instruction `Ugotuj ziemniaky.` (2 words) passes the `looksLikeCookingInstruction` word-count guard (requires ≥4) and outscores the title. |
| E: Metadata → empty | Ogórkowa Zupa | Pipe-separated metadata filtered correctly, `OGÓRKOWA ZUPA` should be candidate. MiniLM gives weak score for Polish ALL_CAPS; positional bonus cap may be too low. |
| F: Title absent | Mushroom Risotto | Title doesn't appear in document. Not fixable without external context. |

---

## Goals

- Fix the 6 continuation-merge failures (Patterns A, B: all files with `(OCR ...)` annotations)
- Fix Pattern C (Sole: dictionary gap)
- Fix Pattern D (Kopytka: short cooking instruction not caught)
- Fix Pattern E (Ogórkowa Zupa: Polish ALL_CAPS weak embedding)
- Maintain 100% accuracy on real files
- No regressions on currently-passing generated files
- Keep total extraction time under 10 seconds on device

## Non-Goals

- Fix Pattern F (Mushroom Risotto: title absent from document) — requires page-level context
- Change the embedding model — MiniLM works well for 102+ passing cases
- Restructure the full candidate generation pipeline — only the merge logic needs fixing

---

## Detailed Changes

### Change 1: Preserve standalone candidate when continuation-merging

**File:** `lib/text-classifier/title-extractor.ts`, lines 646–658

**Problem:** The continuation merge replaces the original line with the merged form and skips ahead. The original short form is never added to `mergedLines`, so it can never become a candidate.

**Fix:** Always emit the original line as well as the merged form. The downstream `seen` set in the candidate loop (line 661) will deduplicate if both forms produce the same normalized text.

```typescript
for (let i = 0; i < capsCoalesced.length; i++) {
  const line = capsCoalesced[i];
  mergedLines.push(line);  // ← always keep the original
  if (i + 1 < capsCoalesced.length) {
    const nextText = capsCoalesced[i + 1].text;
    if (/^[/&+:(]/.test(nextText)) {
      mergedLines.push({ text: `${line.text} ${nextText}`, index: line.index });
      i++;
      continue;
    }
  }
}
```

**Why this is safe:** The `seen` set deduplicates by normalized text. If both the standalone and the merge produce passing candidates, both enter the pool — the dedup and scoring logic downstream picks the better one. If the merge fails hard filters (as in the annotation case), only the standalone survives. If the standalone fails (rare — means the line is truly garbled), the merge might still pass. This is strictly more capable than the current approach.

**Risk assessment:** Low. The continuation merge was designed for cases like `TITLE / SUBTITLE` where the `/` line is meaningless on its own. In those cases, the standalone `TITLE` will still be generated AND the merge `TITLE / SUBTITLE` will also be generated. The existing dedup, prefix-removal, and multi-title logic handles this correctly — the test for `SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE` already has the prefix-removal step that eliminates the standalone when the merge is better.

**Impact:** Directly fixes 6 of 9 failures. After this change, `Braised Cod with White Wine` enters the candidate pool as a standalone, gets dictionary-repaired, scores well against the title embedding, and is selected.

**Cross-iteration note:** This is NOT the same as "removing the continuation merge" — the merge still runs and produces joined candidates. It's adding the standalone alongside it. The merge was introduced in iter 16 to fix fragmented titles; this change preserves that behavior while preventing annotation-merge destruction.

---

### Change 2: Add "sole" and related fish names to the food dictionary

**File:** `lib/text-classifier/food-dictionary.ts`

**Problem:** `S01e with Brown Butter and Capers` — `sole` is not in the food dictionary, so dictionary-guided repair can't resolve the ambiguity. The blind repair produces `Soie` (0→o, 1→i) instead of `Sole` (0→o, 1→l).

**Fix:** Add missing common fish/food names to `FOOD_DICTIONARY`:

```typescript
"sole",     // flatfish — needed for "S01e" OCR repair
"soie",     // NOT a food word — do not add (French for silk)
```

With `sole` in the dictionary, `repairOcrWord("S01e")` generates candidates including `sole` (0→o, 1→l), finds it in the dictionary, and returns `Sole`.

**Impact:** Directly fixes Pattern C. The title becomes `Sole with Brown Butter and Capers` instead of `Soie with Brown Butter and Capers`.

**Risk:** None. `sole` is unambiguously a food item in the context of recipe text.

---

### Change 3: Lower word-count threshold for cooking instruction detection

**File:** `lib/text-classifier/title-extractor.ts`, function `looksLikeCookingInstruction` (line 364)

**Problem:** `Ugotuj ziemniaky.` (2 words) passes through the cooking instruction filter because the guard requires `words.length >= 4`. This 2-word cooking instruction then enters the candidate pool and outscores the title `Kopytka z Pieczarkami Leśnymi`.

The `>= 4` threshold was originally set to prevent short recipe titles like `Roast Chicken` or `Grilled Salmon` from being falsely classified as cooking instructions. But it's too permissive — `Ugotuj ziemniaky.` and `Upiecz chleb.` are clearly instructions, not titles.

**Fix:** Split the word-count guard by language:

```typescript
function looksLikeCookingInstruction(text: string): boolean {
  const words = text.trim().split(/\s+/);
  // English cooking instructions are typically ≥4 words ("Roast the chicken until...")
  // but short English imperatives can also be recipe titles ("Roast Chicken", "Grilled Salmon").
  // Polish cooking instructions are commonly 2-3 words ("Ugotuj ziemniaki.", "Upiecz chleb.")
  // and are unambiguous because Polish recipe titles don't start with imperative verbs.
  if (POLISH_COOKING_INSTRUCTION_STARTS.test(text.trim())) {
    return words.length >= 2;  // Polish: 2+ words is enough
  }
  if (words.length < 4) return false;  // English: keep existing 4-word threshold
  if (COOKING_INSTRUCTION_STARTS.test(text.trim())) return true;
  return false;
}
```

**Why this is safe for Polish but not English:**
- Polish recipe titles never start with bare imperative verbs. The title is always a noun phrase: `Piernik z Śliwkami`, `Kopytka z Pieczarkami`, `Żurek Krakowski`. The cooking section uses imperatives: `Ugotuj`, `Podawaj`, `Dodaj`.
- English recipe titles CAN start with the same words as cooking instructions: `Roast Chicken` (title) vs `Roast the chicken` (instruction). The 4-word guard protects these.

**Impact:** Fixes Pattern D. `Ugotuj ziemniaky.` is now caught as a cooking instruction, never enters the candidate pool. The title `Kopytka z Pieczarkami Leśnymi` (after erratic-casing normalization and `¡→i` repair) wins.

**Risk:** Low. Polish imperative verbs at the start of a line are unambiguously instructions. No Polish recipe title in the test suite or in common cookbook conventions starts with an imperative verb.

---

### Change 4: Strengthen Polish ALL_CAPS positional signal for pipe-metadata preamble

**File:** `lib/text-classifier/title-extractor.ts`, positional bonus logic (lines ~1230–1246)

**Problem:** `OGÓRKOWA ZUPA` appears after a pipe-separated metadata line. The candidate enters the pool and gets the pipe-preamble positional bonus (+0.12), the direct-successor bonus (+0.10), but the combined boost is capped at 0.18 (the pipe+ALL_CAPS special cap from iter 30). MiniLM gives a weak raw embedding score for Polish ALL_CAPS text (likely near 0 or slightly negative), so even with +0.18 boost, the candidate may fall below the threshold.

**Investigation:** The iter 29 plan already raised the cap from 0.15 to 0.18 for pipe+ALL_CAPS. If 0.18 is still insufficient, there are two options:

**Option A (preferred): Raise the cap to 0.22 for pipe+ALL_CAPS.** The pipe-metadata + ALL_CAPS pattern is a near-certain title indicator in Polish cookbooks. The extra 0.04 headroom accounts for MiniLM's English bias.

**Option B: Lower the rawScore floor for pipe+ALL_CAPS candidates.** Currently the fallback path requires `rawScore > -0.05` for early-position candidates. For pipe+ALL_CAPS, this could be relaxed to `-0.10`. But this is riskier — it allows weaker candidates through.

**Fix (Option A):**

```typescript
const maxPositionalBoost =
  hasPipePreamble && isAllCaps(firstCandidate.text) ? 0.22 : 0.15;
```

**Impact:** Fixes Pattern E. The combined positional boost (+0.22 cap) plus any raw embedding signal should clear the threshold.

**Risk:** Low. The cap only applies when ALL conditions are met: (1) all preceding lines are filtered, (2) preceding lines include pipe-separated metadata, (3) the candidate is ALL_CAPS. This is a very specific pattern that is nearly always a recipe title.

---

## Failure → Fix Mapping

| Pattern | Cases | Root cause | Fix | Expected outcome |
|---------|-------|-----------|-----|-----------------|
| A: OCR → empty | 2 | `(` merge destroys title | Change 1 | ✅ Title extracted |
| B: OCR → body sentence | 3 | `(` merge destroys title + body line survives | Change 1 | ✅ Title extracted (body already blocked by iter 30 fixes) |
| C: Partial OCR normalization | 1 | `sole` not in dictionary | Change 2 | ✅ `Sole` correctly repaired |
| D: Erratic case → body sentence | 1 | 2-word Polish instruction passes word-count guard | Change 3 | ✅ Instruction filtered, title wins |
| E: Metadata → empty | 1 | Polish ALL_CAPS too weak for MiniLM | Change 4 | ✅ Positional boost sufficient |
| F: Title absent | 1 | Title not in document | **Not fixable** | ❌ Remains a failure |

**Expected result:** 8 of 9 failures fixed → ≤1 failure (Mushroom Risotto) → ~99.1% accuracy.

---

## Testing Strategy

### Unit tests

1. **Continuation merge preserves standalone:**
   - Input: `["TITLE LINE", "(annotation text)", "lngredients:"]`
   - Verify that both `TITLE LINE` and `TITLE LINE (annotation text)` appear in the candidate list (or just `TITLE LINE` if the merge fails hard filters)

2. **Dictionary repair for "sole":**
   - `repairOcrWord("S01e")` → `"Sole"` (after adding `sole` to dictionary)

3. **Polish 2-word cooking instruction detection:**
   - `looksLikeCookingInstruction("Ugotuj ziemniaki.")` → `true`
   - `looksLikeCookingInstruction("Podawać ciepło.")` → `true`
   - `looksLikeCookingInstruction("Ugotuj")` → `false` (1 word)
   - `looksLikeCookingInstruction("Roast Chicken")` → `false` (English, <4 words)
   - `looksLikeCookingInstruction("Roast the chicken gently")` → `true` (English, 4 words)

### Integration tests (eval loop)

Run the full evaluation suite against all 111 test files:
- 0 regressions on currently-passing files
- 8 newly-passing files (all except Mushroom Risotto)
- Target: ≥99% combined accuracy

### Regression watchlist

Changes 1 and 3 have the widest blast radius. Specific cases to verify:

- **Change 1:** `SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE` — the continuation merge must still produce the full joined title. The standalone `SAFFRON WHEAT BUNS WITH QUARK` will also be generated; existing prefix-removal logic should handle this correctly.
- **Change 1:** `Baked Eggs with Feta, Harissa Tomato Sauce & Coriander` — `& Coriander` is a continuation; standalone `Baked Eggs with Feta, Harissa Tomato Sauce` should not replace the full form.
- **Change 3:** Polish titles starting with words that look like verbs but aren't — e.g., `Smażona zielona fasolka` starts with `Smażona` (adjective "fried"), not `Smaż` (imperative "fry"). The regex `^sma[zż]\b` would NOT match `Smażona` because `\b` is after `ż`/`z` and before `o` — both word chars. ✓ Safe.

---

## Performance Considerations

All changes are O(1) per candidate:
- Change 1: One extra `push()` per merged line (at most ~5 lines total)
- Change 2: One dictionary entry addition
- Change 3: One regex test moved before the word-count guard
- Change 4: One constant change

No additional embedding calls. No new async operations. Total impact: negligible (<1ms).

---

## Implementation Order

1. **Change 1** (continuation merge) — highest impact, fixes 6/9 failures
2. **Change 3** (Polish cooking instruction threshold) — fixes 1 failure, verify no regressions
3. **Change 2** (food dictionary) — trivial, fixes 1 failure
4. **Change 4** (positional cap) — may not be needed if Change 1 indirectly helps. Implement and verify.

---

## Open Questions

1. **Change 4 necessity:** After Change 1, the `(OCR CORRUPTION...)` annotation line won't be merged with the title anymore. But for the Ogórkowa Zupa case, there's no annotation — the issue is purely the pipe-metadata + weak Polish embedding. So Change 4 is still needed independently. However, we should verify the actual raw embedding score for `OGÓRKOWA ZUPA` to calibrate the cap correctly.

2. **Test generator annotations:** The `(OCR CORRUPTION: ...)` lines in generated test files are synthetic artifacts. Should the test generator be updated to remove them? They serve a documentation purpose but they've now been shown to interact badly with the extraction pipeline. For now, fixing the extractor (Change 1) is the right approach — the extractor should be robust to any parenthetical content near the title.

3. **Broader `(` merge safety:** Beyond `(OCR ...)`, any parenthetical text immediately after a title could trigger the merge. Real OCR output might include page references like `(serves 4)` or `(continued)` after a title. Change 1 handles this by preserving the standalone, so the merged form's failure doesn't destroy the original candidate.

---

## References

- Iteration 29 improvement plan: `tools/title-loop/docs/29-e7e3098/improvement-plan.md`
- Architecture doc: `tools/title-loop/docs/architecture.md`
- Continuation merge introduced: iteration 16 (to fix fragmented titles)
- Positional cap introduced: iteration 26 (+0.15), raised iter 30 (+0.18 for pipe+ALL_CAPS)

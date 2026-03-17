# Iteration 29 → 30 Improvement Plan

**Status:** Draft
**Date:** 2026-03-17
**Baseline:** 91.9% combined accuracy (9 failures, all generated; 0 real failures)

---

## Overview

Nine generated-file failures remain, clustered into three root causes:

1. **Incomplete mixed-case OCR repair** — the blind repair path (`applyBlindOcrRepairToken`) only substitutes `1→i/l`, `¡→i`, `€→e` in mixed-case context. It misses `0→o`, `4→a`, `5→s`, which the ALL_CAPS branch handles. This causes Pattern 7 (partial repair) and contributes to Patterns 1–4 where partially-repaired titles fail hard filters or score poorly.

2. **Missing Polish cooking verb prefixes** — `looksLikeCookingInstruction` and `POLISH_COOKING_INSTRUCTION_STARTS` don't cover perfective forms like `ugotuj` (u+gotuj), `upiecz` (u+piecz), `podawać/podaw4ć` (serve). Body lines starting with these verbs pass hard filters and can outscore the actual title.

3. **Garbled tokens evade multi-word detection** — `isLikelyGarbled` catches single-word `[a-z][A-Z]` transitions (line 302) but not multi-word candidates containing such tokens. `XxYyZz salt and pepper` passes because the garbled check only fires for `words.length === 1`.

Pattern 6 (Mushroom Risotto — title absent from document) is a structural/scan problem where the actual recipe title doesn't appear in the text. The extractor correctly identifies the best title-like line; it's just the wrong recipe. This is **not fixable** without external context and is excluded from this plan.

---

## Goals

- Fix Patterns 1, 2, 3, 4, 5, 7 (8 of 9 failures)
- Maintain 100% accuracy on real files
- No regressions on currently-passing generated files
- Keep total extraction time under 10 seconds on device

## Non-Goals

- Fix Pattern 6 (title absent from document) — requires page-level context
- Change the embedding model or similarity strategy — MiniLM works well for the 102+ passing cases
- Restructure the candidate generation pipeline — it's architecturally sound

---

## Detailed Changes

### Change A: Complete mixed-case blind OCR repair

**File:** `lib/text-classifier/title-extractor.ts`, function `applyBlindOcrRepairToken` (lines 845–857)

**Problem:** The mixed-case branch only handles three substitutions:
```typescript
// Current mixed-case path (lines 852-856):
.replace(/(?<=[a-zà-ż])1/g, oneLetter)
.replace(/1(?=[a-zà-ż])/g, oneLetter)
.replace(/¡/g, "i")
.replace(/€/g, "e")
```

Missing: `0→o`, `4→a`, `5→s` — all present in the ALL_CAPS branch (lines 879–884) but absent from mixed-case. This directly causes Pattern 7 (`S01e` → `S0ie` instead of `Sole`) and weakens repair of Patterns 1–4.

**Fix:** Add the missing substitutions with lowercase-adjacent context guards:
```typescript
// After the existing 1→oneLetter and ¡→i replacements, add:
.replace(/(?<=[a-zà-ż])0/g, "o")
.replace(/0(?=[a-zà-ż])/g, "o")
.replace(/(?<=[a-zà-ż])4/g, "a")
.replace(/4(?=[a-zà-ż])/g, "a")
.replace(/(?<=[a-zà-ż])5/g, "s")
.replace(/5(?=[a-zà-ż])/g, "s")
```

The lookaround guards (requiring adjacent lowercase letters) prevent false positives on legitimate digits in titles like "Variation 4" or "Page 50".

**Also update `generateBlindOcrVariants`** (lines 920–938): the dual-variant logic currently only varies `1→i` vs `1→l`. With `0→o` added, `S01e` will now produce `Sole` in a single pass (both `0→o` and `1→i` fire). No dual-variant needed for `0`.

**Impact:** Fixes Pattern 7 directly. Strengthens repair for Patterns 1–4 by ensuring the blind repair path produces cleaner candidates that score better in embeddings.

**Risk:** Low. The lookaround guards prevent over-application. The ALL_CAPS branch already applies these substitutions unconditionally.

---

### Change B: Expand garbled token detection to multi-word candidates

**File:** `lib/text-classifier/title-extractor.ts`, function `isLikelyGarbled` (lines 271–337)

**Problem:** The `[a-z][A-Z]` internal transition check (line 302) only fires for single-word candidates (`words.length === 1`). Multi-word candidates like `XxYyZz salt and pepper` pass because `XxYyZz` is never checked individually for the transition pattern.

**Fix:** Add a multi-word garbled token check alongside the existing short-word check (lines 318–333):

```typescript
// After the existing short-word check (line 331-333), add:
// Multi-word candidate with a garbled token: a word with internal
// lowercase→uppercase transition that isn't a known camelCase pattern
// (e.g., "McDonald", "McCormick"). Catches "XxYyZz", "UuIw" etc.
const hasGarbledCamelCase = words.some(
  (w) =>
    w.length >= 3 &&
    /[a-z][A-Z]/.test(w) &&
    !/^(Mc|Mac)[A-Z]/.test(w)  // Exempt Scottish/Irish names
);
if (hasGarbledCamelCase) {
  return true;
}
```

**Impact:** Fixes Pattern 3 (Żurek Krakowski → `XxYyZz salt and pepper`). The garbage token `XxYyZz` triggers the `[a-z][A-Z]` check, causing the entire candidate to be rejected by hard filters. The clean title `Żurek Krakowski` at position 0 then wins.

**Risk:** Low. Legitimate recipe titles never contain camelCase words. The `Mc`/`Mac` exemption handles the only realistic edge case (e.g., "McCormick Spice Blend"), though this pattern is unlikely in recipe OCR.

---

### Change C: Expand Polish cooking verb filter

**File:** `lib/text-classifier/title-extractor.ts`, `POLISH_COOKING_INSTRUCTION_STARTS` (line 346)

**Problem:** The regex misses common perfective-prefix verbs:
- `ugotuj` (u+gotuj = "cook [to completion]") — causes Pattern 4 (`Ugotuj ziemniaky. (38)` wins)
- `upiecz` (u+piecz = "bake [to completion]")
- `usmaż` is already covered, but `upiecz` and `ugotuj` are not
- `podawaj` is covered, but `podaw` without the full suffix isn't (OCR-corrupted `Podaw4ć` → after repair → `Podawać`)

**Fix:** Add missing verb forms to `POLISH_COOKING_INSTRUCTION_STARTS`:

```typescript
// Add to the alternation group:
ugotuj|ugotowac|upiecz|usmaz    // perfective u- prefix forms
|podawa[cć]                      // infinitive form of "serve"
|zapiekaj                        // "bake in oven"
|obtocz|obtoczyc                 // "coat/roll in"
|podgrzej|podgrzewaj             // "reheat/warm up"
```

Also add a catch-all for OCR-corrupted Polish verbs: lines ending with `4ć` (OCR for `ać`) that start with a known cooking-verb stem should be treated as cooking instructions. This can be done by adding an OCR-aware variant to the regex or by normalizing `4→a` before the instruction check.

**Impact:** Fixes Patterns 2 and 4 where `Podaw4ć ...` or `Ugotuj ...` body lines outscore the title. Once these lines are filtered as cooking instructions, they never enter the candidate pool.

**Risk:** Low. These are unambiguous cooking verbs that never start recipe titles. `Ugotuj` is always imperative (≠ title). `Podawać` is always an instruction (≠ title).

---

### Change D: Pre-filter OCR normalization for cooking instruction detection

**File:** `lib/text-classifier/title-extractor.ts`, function `looksLikeCookingInstruction` (line 348) and function `passesHardFilters` (line 385)

**Problem:** `Podaw4ć letni lub chłodny.` fails the cooking instruction check because `Podaw4ć` doesn't match any verb pattern (the `4` breaks the regex). The line passes hard filters and becomes a candidate. After OCR repair it might become `Podawać letni lub chłodny.` but by then it's already in the pool.

**Fix:** In `passesHardFilters`, apply lightweight OCR normalization (`4→a`, `1→i`, `0→o`, `5→s`) to the text **before** checking `looksLikeCookingInstruction`:

```typescript
function passesHardFilters(text: string): boolean {
  if (text.length < 3 || text.length > 80) return false;
  if (looksLikeIngredient(text)) return false;
  if (startsWithNumber(text)) return false;
  if (looksLikeMetadata(text)) return false;
  if (isLikelyGarbled(text)) return false;
  // Apply lightweight OCR normalization before instruction check
  // so that "Podaw4ć" is recognized as "Podawać" (cooking instruction)
  const ocrNormalized = text
    .replace(/4(?=[a-zà-żA-ZÀ-Ż])/g, (_, offset) =>
      /[A-ZÀ-Ż]/.test(text[offset]) ? "A" : "a")
    .replace(/(?<=[a-zà-żA-ZÀ-Ż])4/g, (_, offset) =>
      /[A-ZÀ-Ż]/.test(text[offset - 1]) ? "A" : "a");
  if (looksLikeCookingInstruction(ocrNormalized)) return false;
  // ... rest of existing checks
```

This is a targeted normalization (only `4→a` for now, since that's the specific failure), not the full blind repair. It runs before the instruction check so corrupted Polish verbs are correctly identified.

**Impact:** Directly fixes Patterns 2 cases (`Podaw4ć letni lub chłodny.` and `Podaw4ć ciepło ze śmietaną lub lodami.`) by preventing them from entering the candidate pool.

**Risk:** Low. `4` adjacent to letters is almost always an OCR artifact, not a legitimate digit. Recipe titles don't contain `4` adjacent to letters.

**Cross-iteration note:** Iteration 24 introduced dictionary-guided OCR repair as the primary approach, noting that blind substitution is ambiguous without word context. This Change D normalization is intentionally limited to the hard-filter path (not candidate text) and only applies `4→a` for cooking instruction detection. It should use the same substitution logic as `applyBlindOcrRepairToken` (Change A) to avoid divergence between the two OCR normalization paths.

---

### Change E: Strengthen first-after-metadata positional bonus

**File:** `lib/text-classifier/title-extractor.ts`, first-after-preamble bonus (lines 1121–1149)

**Problem:** Pattern 5 (Ogórkowa Zupa) — the document starts with pipe-separated metadata, then a blank line, then the ALL_CAPS title. The first-after-preamble bonus fires (all preceding lines are filtered), but the bonus may not be enough to overcome a weak embedding score for Polish ALL_CAPS text in the MiniLM model.

**Investigation needed:** Confirm whether `OGÓRKOWA ZUPA` is actually entering the candidate pool and what its raw embedding score is. The MiniLM model is English-centric and may score Polish ALL_CAPS titles very poorly (negative rawScore), causing them to fall below even the relaxed fallback threshold.

**Cross-iteration context:**
- Iteration 8 introduced the `-0.05` rawScore floor for positions 0–2 specifically to prevent header/ingredient leakage into the fallback path. The rationale was: "The -0.05 lower bound prevents candidates with actively negative signal from leaking through."
- Iteration 26 introduced a combined positional bonus cap of `+0.15` when both the preamble bonus and candidate-relative position bonus fire, to prevent over-boosting non-title candidates.
- Iteration 27 added the direct-successor bonus (`+0.10`) sharing the same `maxPositionalBoost` cap of `+0.15`.

These prior decisions must be respected. Lowering the rawScore floor or raising the preamble bonus to the cap value would undermine the carefully layered bonus system.

**Fix (two-part, conservative approach):**

**Part 1 (preferred):** Keep the `-0.05` rawScore threshold unchanged. Instead, raise the combined `maxPositionalBoost` cap from `+0.15` to `+0.18` **only** when the candidate has pipe-separated metadata on the preceding line AND the candidate is ALL_CAPS. This provides additional headroom for the existing `+0.12` preamble bonus to stack with the candidate-relative position bonus without hitting the cap, while preserving the iteration 8 floor that guards against header/ingredient leakage.

```typescript
// When computing maxPositionalBoost:
const maxPositionalBoost =
  hasPipeSeparatedMetadataPreamble && isAllCaps ? 0.18 : 0.15;
```

This is a narrow, targeted relaxation: pipe-separated metadata followed by ALL_CAPS is a near-certain title pattern in Polish cookbooks, so the slightly higher cap is safe.

**Part 2 (only if Part 1 is insufficient):** If the candidate still doesn't score high enough with the raised cap, the root cause is likely that Changes A–D (OCR repair improvements) haven't run yet — better OCR repair should produce a cleaner candidate that scores better in MiniLM embeddings. Re-evaluate after implementing Changes A–D before adding further positional overrides.

**Impact:** Fixes Pattern 5. The pipe-separated metadata line is correctly filtered, and the ALL_CAPS title immediately after gets sufficient positional boost to overcome weak Polish embedding signal.

**Risk:** Low. The rawScore floor (`-0.05`) from iteration 8 is preserved. The cap raise is narrow (only pipe-metadata + ALL_CAPS) and small (+0.03). The layered bonus system from iterations 24/26/27 remains intact — the preamble bonus (`0.12`) and direct-successor bonus (`0.10`) can now both contribute without being clamped at `0.15`.

---

### Change F: Add `(N)` trailing page/step number stripping

**File:** `lib/text-classifier/title-extractor.ts`, function `passesHardFilters` (line 385) or `stripPageNumber` (line 521)

**Problem:** `Ugotuj ziemniaky. (38)` — the `(38)` suffix is a page or step number that isn't caught by existing filters. This contributes to Pattern 4 where the instruction line passes filters and scores well.

**Fix:** Add a stripping rule for trailing parenthesized numbers:

```typescript
function stripTrailingPageRef(text: string): string {
  // "Ugotuj ziemniaky. (38)" → "Ugotuj ziemniaky."
  // "RECIPE NAME (p. 42)" → "RECIPE NAME"
  return text.replace(/\s*\((?:p\.?\s*)?\d{1,4}\)\s*$/, "").trim();
}
```

Apply this in `buildCandidates` alongside `stripPageNumber` and `stripParentheticalGloss` (line 648). After stripping, the `isLikelyGarbled` mid-sentence-boundary check (`. ` followed by letter) won't be confused by the page ref.

**Impact:** Minor supporting fix for Pattern 4. The main fix is Change C (cooking verb filter), but this strips noise that could affect scoring.

**Risk:** Low. Trailing `(N)` where N is 1–4 digits is never part of a recipe title.

---

## Testing Strategy

### Unit tests to add

1. **Mixed-case OCR repair completeness:**
   - `applyBlindOcrRepairToken("S01e", "i")` → `"Sole"` (0→o + 1→i)
   - `applyBlindOcrRepairToken("m4ki", "i")` → `"maki"` (4→a)
   - `applyBlindOcrRepairToken("P5eudo", "i")` → `"Pseudo"` (5→s)
   - `applyBlindOcrRepairToken("test5", "i")` → `"tests"` (5→s at end)

2. **Garbled multi-word detection:**
   - `isLikelyGarbled("XxYyZz salt and pepper")` → `true`
   - `isLikelyGarbled("McDonald Spice Blend")` → `false` (Mc exemption)
   - `isLikelyGarbled("Żurek Krakowski")` → `false`

3. **Polish cooking verb expansion:**
   - `looksLikeCookingInstruction("Ugotuj ziemniaki w osolonej wodzie.")` → `true`
   - `looksLikeCookingInstruction("Podawać letni lub chłodny.")` → `true`
   - `looksLikeCookingInstruction("Ugotuj")` → `false` (< 4 words)

4. **OCR-normalized instruction detection:**
   - `passesHardFilters("Podaw4ć letni lub chłodny.")` → `false` (cooking instruction after OCR norm)

### Integration tests (eval loop)

Run the full evaluation suite against all 111 test files. Expected outcomes:
- 0 regressions on currently-passing files
- 8 newly-passing files (all except Mushroom Risotto)
- Target: ≥99% combined accuracy (≤2 failures)

---

## Performance Considerations

All changes are O(1) per candidate (regex replacements, string checks). No additional embedding calls. No new async operations. Total impact on extraction time: negligible (< 1ms).

---

## Implementation Order

Changes are independent and can be implemented in any order. However, the recommended order maximizes incremental testability:

1. **Change B** (garbled multi-word) — simplest, one check addition, fixes Pattern 3
2. **Change C** (Polish verbs) — small regex expansion, fixes Pattern 2 partially
3. **Change D** (OCR-normalized instruction check) — completes Pattern 2 fix
4. **Change A** (mixed-case OCR repair) — addresses Patterns 1, 4, 7
5. **Change F** (trailing page ref) — minor cleanup
6. **Change E** (positional bonus) — Pattern 5, needs investigation if still needed after A–D

---

## Open Questions

1. **Pattern 5 root cause:** Is `OGÓRKOWA ZUPA` actually entering the candidate pool? If the raw embedding score for Polish ALL_CAPS is very negative, Change E alone may not suffice. May need to log scoring details for this specific test case during implementation.

2. **Dictionary coverage for `with/the/a`:** The food dictionary includes `"with"` (line 135), so `w1th` should be dictionary-repaired to `with`. If the dictionary-guided repair already fixes most artifacts for Patterns 1–2, the blind repair improvement (Change A) may be redundant for those cases. But it's still needed for Pattern 7 and words not in the dictionary.

3. **`4→a` lookaround precision:** The current `0→O` substitution in the ALL_CAPS branch uses `(?<=[A-ZÀ-Ż])0` — requiring adjacent uppercase. For mixed-case, should we require BOTH adjacent characters to be letters, or just one? Single-sided lookaround matches more cases but has a slightly higher false-positive risk (e.g., `m4` in an ingredient line like `300g m4ki pszenne`). However, ingredient lines are already filtered by `looksLikeIngredient`, so the risk is minimal.

---

## Failure → Fix Mapping

| Pattern | Failures | Root cause | Primary fix | Secondary fix |
|---------|----------|-----------|-------------|---------------|
| 1: OCR → empty | 2 | Corrupted title rejected, no fallback | A (complete OCR repair) | E (relaxed fallback) |
| 2: OCR → wrong body | 2 | Body line (`Podaw4ć...`) outscores title | C (Polish verbs) + D (OCR-norm filter) | A (better repair) |
| 3: Garbage → wrong body | 1 | `XxYyZz` evades garbled check | B (multi-word garbled) | — |
| 4: Erratic case → wrong body | 1 | `Ugotuj ziemniaky. (38)` wins | C (Polish verbs) + A (OCR repair) | F (page ref strip) |
| 5: Metadata → empty | 1 | Polish ALL_CAPS weak embedding | E (positional bonus) | A (may help indirectly) |
| 6: Title absent | 1 | Structural problem | **Not fixable** | — |
| 7: Partial OCR | 1 | `0→o` missing in mixed-case | A (complete OCR repair) | — |

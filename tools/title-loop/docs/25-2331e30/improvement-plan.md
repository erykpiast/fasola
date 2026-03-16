# Iteration 25 → 26 Improvement Plan

## Title

Fix OCR preamble artifact leaking into compound title assembly

## Status

Draft

## Authors

Claude — 2026-03-17

## Overview

Iteration 25 has 1 real-file failure and 0 generated-file failures. The single failure
is a compound title where an OCR artifact from a preceding page (`DAT FLATBREADS`) is
selected instead of the correct second recipe title (`FINNISH POTATO FLATBREADS`).

The fix introduces **vocabulary corroboration** — a lightweight check that validates
ALL_CAPS title candidates against the rest of the document before including them in
multi-title output. This targets the specific failure mode (orphaned OCR artifacts
masquerading as titles) without disrupting the existing scoring pipeline.

## Background / Problem Statement

### The failure

- **Expected:** `FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS`
- **Extracted:** `DAT FLATBREADS + FINNISH MILK FLATBREADS`

The input file contains OCR overflow from a preceding recipe on lines 1–5. Line 4 reads
`DAT FLATBREADS` — a truncated/corrupted remnant of the previous page's title (likely
"OAT FLATBREADS" or similar). Because it is ALL_CAPS and 2 words, it passes every hard
filter and looks structurally identical to a real recipe title.

The multi-title logic finds 3 ALL_CAPS candidates (`DAT FLATBREADS`, `FINNISH MILK
FLATBREADS`, `FINNISH POTATO FLATBREADS`), keeps all 3 (non-first candidates aren't
sub-headers), caps at 3, and joins them. The extracted result is the first two.

Wait — the extracted output is only 2 titles, not 3. This means either:
(a) `FINNISH POTATO FLATBREADS` on line 29 was filtered or failed to enter the candidate
pool (the 25-candidate cap may exclude it), or
(b) dedup or sub-header logic removed it.

Either way, the root cause is the same: `DAT FLATBREADS` shouldn't be in the pool at all.

### Why existing defenses don't catch it

| Defense | Why it fails |
|---------|-------------|
| `findBurstEnd` | Skips garbled lines, but `DAT FLATBREADS` is clean ALL_CAPS — burst detection stops before it |
| `isLikelyGarbled` | "DAT" has vowels, no mixed scripts, no pipes — passes |
| `passesHardFilters` | 2 words, all-caps, no ingredients/metadata — passes |
| Embedding scoring | "DAT FLATBREADS" embeds close to "recipe name, dish title" — decent rawScore |
| Structural heading | ALL_CAPS with ≥2 words, ≥4 alpha letters each — qualifies |

The extractor has no mechanism to ask: "Does this candidate's vocabulary appear elsewhere
in the document?" For real titles, the answer is almost always yes (the recipe body
references the dish name, ingredients, or key terms). For orphaned OCR artifacts, the
answer is typically no.

### What works well (do not change)

- The overall pipeline: candidate generation → hard filters → embedding scoring → multi-title assembly
- Dictionary-guided OCR repair (iteration 24) — no regressions
- Compound title dedup protection (iteration 24) — working correctly
- Bilingual detection and fallback hierarchy — stable
- Generated file accuracy: 0 failures — the synthetic test suite is fully passing

## Goals

- Fix the 1 real-file failure (FINNISH MILK/POTATO FLATBREADS)
- Do not regress any currently-passing real or generated files
- Keep the fix minimal and targeted — the system is 90.9% accurate with 0 generated failures

## Non-Goals

- Replacing the embedding model or scoring architecture
- Reworking the multi-title assembly logic broadly
- Fixing hypothetical future failure modes not evidenced by current test data
- Adding new generated test files

---

## Detailed Design

### Root cause analysis

Looking at the actual input file:

```
Line 1:  "2 (/½ cup plus ı tablespoon a sland mixer fried with v for s minutes..."  ← garbled overflow
Line 2:  "nto a loured work counter, t es and shape into ball a a"                   ← garbled overflow
Line 3:  "3 pan over a medium beat y i both sides..."                                ← garbled overflow
Line 4:  "DAT FLATBREADS"                                                            ← OCR artifact
Line 5:  "le Finnish region of Savo 1a bread, it's more like a..."                   ← body of previous recipe
...
Line 16: "FINNISH MILK FLATBREADS"                                                   ← correct title #1
...
Line 29: "FINNISH POTATO FLATBREADS"                                                 ← correct title #2
```

Lines 1–3 are garbled sentence fragments from the preceding recipe. Despite looking
garbled, they are **long** (70–200+ characters), so `findBurstEnd`'s short-garbled-line
skip (which requires `text.length < 20`) does not fire. Lines 1 and 3 start with digits
("2", "3"), so the prose-preamble check (`/^[a-ząćęłńóśźż]/`) also does not match them.
`findBurstEnd` returns 0 — no preamble is detected at all.

Line 4 (`DAT FLATBREADS`) is the tail-end of the previous recipe's title, corrupted by
OCR. Lines 5+ are the body of that previous recipe. The actual recipes start at line 16.

Because no preamble is skipped, `DAT FLATBREADS` enters the candidate pool as a normal
ALL_CAPS heading and survives all hard filters.

### Proposed fix: Vocabulary corroboration for multi-title candidates

Add a **corroboration score** to each ALL_CAPS candidate when the multi-title path
(≥2 ALL_CAPS survivors) is active. The score measures how many of the candidate's
content words appear elsewhere in the document body.

#### Algorithm

```
function corroborationScore(candidate, allLines):
  contentWords = candidate.text
    .split(/\s+/)
    .filter(w => w.length >= 4)       // skip "THE", "WITH", "AND", etc.
    .map(w => w.toUpperCase())

  if contentWords.length === 0:
    return 1.0                          // single short word — can't check, pass through

  corroboratedCount = 0
  for word in contentWords:
    // Check if word appears in any other line (not the candidate's own line)
    for line in allLines:
      if line.position === candidate.position: continue
      if line.text.toUpperCase().includes(word):
        corroboratedCount++
        break

  return corroboratedCount / contentWords.length
```

**Integration point:** In the multi-title assembly block (around line 1254), after
identifying ≥2 ALL_CAPS survivors but before the sub-header check, filter out candidates
with corroboration score below a threshold (e.g., 0.5 — meaning fewer than half of the
candidate's content words appear elsewhere in the document).

#### Why this works for the failure case

| Candidate | Content words | Corroborated? | Score |
|-----------|--------------|---------------|-------|
| `DAT FLATBREADS` | DAT, FLATBREADS | DAT: **NO** (appears nowhere else), FLATBREADS: YES (lines 16, 29, etc.) | 0.5 |
| `FINNISH MILK FLATBREADS` | FINNISH, MILK, FLATBREADS | FINNISH: YES (lines 29, 5, etc.), MILK: YES (line 21), FLATBREADS: YES | 1.0 |
| `FINNISH POTATO FLATBREADS` | FINNISH, POTATO, FLATBREADS | FINNISH: YES, POTATO: YES (line 31, 37), FLATBREADS: YES | 1.0 |

With a threshold of 0.5 (strict >, not ≥), `DAT FLATBREADS` at exactly 0.5 would be
removed. With a threshold of `< 0.5` (keep if ≥ 0.5), it would survive.

A safer threshold: require that **all content words of length ≥ 4** are corroborated
(score = 1.0), OR that the candidate has at least 3 content words with ≥ 2/3 corroborated.
For 2-word candidates like `DAT FLATBREADS`, this means both words must appear elsewhere.

**Recommended rule:** For candidates with ≤ 3 content words, require 100% corroboration.
For candidates with > 3 content words, require ≥ 67% corroboration. This is strict for
short candidates (where a single uncorroborated word is suspicious) and relaxed for long
ones (where one unusual word in a longer title is acceptable).

```typescript
const threshold = contentWords.length <= 3 ? 1.0 : 0.67;
if (corroborationScore < threshold) {
  // Remove candidate from multi-title assembly
}
```

For `DAT FLATBREADS`: 2 content words, threshold = 1.0, score = 0.5 → **removed**.

#### Why this is safe for other cases

- **Single-title pages** (most recipes): Corroboration is only checked in the multi-title
  path (≥2 ALL_CAPS survivors). Single-title pages are unaffected.

- **Legitimate compound titles** (e.g., `SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE`):
  These are single candidates with compound separators, not multi-title assembly. Unaffected.

- **Multi-recipe pages** where both titles are real: Both titles' content words will appear
  in their respective recipe bodies (ingredients, descriptions). They corroborate easily.

- **Very short titles** (1 content word, e.g., a hypothetical `GOLONKA`): The
  `contentWords.length === 0` guard returns 1.0 for candidates with no words ≥ 4 letters.
  A single 4+ letter word would need corroboration, which is correct — if the word
  doesn't appear anywhere in the document, it's suspicious.

### Implementation changes

#### File: `lib/text-classifier/title-extractor.ts`

| Change | Location | Description |
|--------|----------|-------------|
| Add `corroborationScore()` function | New function, near scoring helpers | Compute vocabulary overlap between candidate and rest of document |
| Apply corroboration filter in multi-title path | ~line 1254, inside `allCapsSelected.length >= 2` branch | Remove ALL_CAPS candidates below corroboration threshold before sub-header check |

No new files. No changes to `food-dictionary.ts`, `embeddings.ts`, `findBurstEnd`, or test files.

---

## Testing Strategy

### Verifying the fix

1. **Primary:** Run the title-loop evaluation harness (`tools/title-loop/title-loop.py`)
   and confirm:
   - `FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS` now passes
   - No regressions in real or generated files

2. **Unit test cases to add** (in `lib/text-classifier/__tests__/title-extractor.test.ts`):

   - **Corroboration rejects orphaned artifact:** Input with garbled preamble + orphaned
     ALL_CAPS + 2 real recipe titles → only real titles returned
   - **Corroboration keeps legitimate multi-recipe:** Input with 2 ALL_CAPS titles that
     both have body text referencing their words → both kept

3. **Edge case tests:**
   - Short ALL_CAPS title (2 words) where one word is common ("CHICKEN SOUP") and appears
     in body → kept (both words corroborated)
   - ALL_CAPS title with an unusual/unique word that doesn't appear in body but is
     clearly the title → still works because it's the only candidate (single-title path,
     corroboration not applied)

### What not to test

- Generated file generation — 0 failures, don't add new synthetic cases for this pattern
- Embedding model behavior — not changed
- OCR repair — not changed

---

## Performance Considerations

The corroboration check iterates over candidate content words × document lines. With
typical values (2–4 content words, 30–50 lines), this is ~100–200 string operations.
Negligible compared to the embedding computation (which dominates the 10-second budget).

The `findBurstEnd` improvement adds a constant-time check. No performance impact.

---

## Security Considerations

None. All changes are in local text processing with no I/O or user-facing API changes.

---

## Implementation Phases

### Phase 1: Core fix (single change set)

1. Add `corroborationScore()` helper function
2. Integrate corroboration filter into multi-title assembly (≥2 ALL_CAPS branch)
3. Run evaluation harness, confirm fix + no regressions

This is a single-phase change. The fix is small and targeted.

---

## Open Questions

1. **Corroboration threshold for 2-word candidates:** Should we require 100% (both words
   corroborated) or allow 50% (at least one word)? The 100% rule is safer for the known
   failure case but could be too strict for hypothetical titles with one unusual word.
   **Recommendation:** Start with 100% for ≤ 3 content words. If a regression appears,
   relax to 50%.

2. **Should corroboration apply to single-title path too?** Currently proposed only for
   multi-title (≥2 ALL_CAPS). Applying it to single-title would add a safety net but
   risks rejecting legitimate titles with unique words. **Recommendation:** No — the
   single-title fallback hierarchy already handles this well enough.

3. ~~**Should `findBurstEnd` improvement be included?**~~ Removed — analysis showed that
   `findBurstEnd` doesn't skip the garbled preamble lines (they're long, not short), so
   the proposed `i > 0` guard would never fire. A preamble detection improvement may be
   worth pursuing in a future iteration if new failures surface, but it requires a
   different approach (handling long garbled lines, not just short ones).

---

## References

- Iteration 25 feedback: `tools/title-loop/docs/25-2331e30/feedback.md`
- Iteration 24 improvement plan: `tools/title-loop/docs/24-b15aa30/improvement-plan.md`
- Failing test input: `tools/title-loop/input/FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS.real.txt`
- Multi-title assembly logic: `lib/text-classifier/title-extractor.ts:1245-1314`

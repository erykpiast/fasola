# Iteration 19 — Failure Analysis

## Overview

1 failure out of 11 real-file test cases (90.9% pass rate). This is a **regression** — "Smażona zielona fasolka" passed in iteration 18 and now fails in iteration 19. The remaining 10 real files still pass.

---

## Pattern 1: commonShort2 Expansion Admits Polish Body-Text as Candidates

**Affected file:** `Smażona zielona fasolka.real.txt` (real file)

**Affects:** Real files only. This specific regression cannot occur in generated files because the generated template files use English OCR content.

---

### What the file contains

```
Line 0:  Smażona zielona fasolka          ← correct title (mixed-case Polish)
Line 1:  GREEN BEANS BORKEUM              ← ALL_CAPS English translation
Line 2:  그린빈 볶음                        ← Korean original
...
Line 21: No potelni rozprowadż oliwę z oliwek i smaż crosnek na duzym ogr
Line 23: Podawaj no gorqco lub na zimno   ← "Serve hot or cold" (Polish)
Line 24: 64
```

The correct answer is `Smażona zielona fasolka`. The file is a bilingual recipe page: Polish title on line 0, then an ALL_CAPS English/romanization translation on line 1.

---

### Why iteration 18 passed

In iteration 18, `commonShort2` contained only basic Polish prepositions (`w`, `z`). The line `Podawaj no gorqco lub na zimno` contained `"na"` — a 2-letter lowercase word not in commonShort2. The `isLikelyGarbled` multi-word check flagged `"na"` as a garbled fragment, causing the entire line to be filtered by `passesHardFilters`. Only `"Smażona zielona fasolka"` (and the now-suppressed bilingual translation pair) survived as candidates, so the single-title result was correct.

---

### What iteration 19 changed

Iteration 19 added Polish prepositions to `commonShort2`:

```typescript
"ze", "bo", "na", "ni", "po", "ku", "od", "za", "co",
```

This was intended to fix titles like `Krem Grzybowy ze Śmietaną` (Pattern 2 from iter 18). It succeeded at that. However, it has a **collateral effect**: Polish body-text lines that previously failed the garbled-word check because they contained these prepositions now pass `passesHardFilters`.

Specifically in this file:

- **`"Podawaj no gorqco lub na zimno"`** (line 23, "Serve hot or cold"):
  In iter 18: `"na"` triggered `hasGarbledWord` → filtered.
  In iter 19: `"na"` is in `commonShort2` → not flagged → **passes all hard filters**.

- **`"No potelni rozprowadż oliwę z oliwek i smaż crosnek na duzym ogr"`** (line 21):
  Same mechanism — `"na"` passes in iter 19 but would have been caught in iter 18.

Both lines now enter the candidate pool as single-line candidates.

---

### Why the algorithm fails

The bilingual detection (unchanged between iter 18 and 19) correctly identifies `GREEN BEANS BORKEUM` as a translation of `Smażona zielona fasolka` and suppresses it from `scoredForThreshold`. This prevents the translation's ALL_CAPS bonuses from inflating the threshold. So far so good.

However, the newly admitted body-text candidates are **not translations** — the bilingual detection has no mechanism to identify them. They enter the scoring pool as ordinary candidates.

The failure path is most likely through the **multi-title guard**:

1. After threshold filtering, `selected` contains `"Smażona zielona fasolka"` PLUS one or more body-text candidates (e.g., `"Podawaj no gorqco lub na zimno"`).
2. `allCapsSelected = selected.filter(s => isAllCaps(s.text))` = **empty** (GREEN BEANS BORKEUM was suppressed; body-text lines are mixed-case).
3. When `allCapsSelected.length === 0`, the multi-title guard takes the implicit path: **keep all candidates**.
4. Both `"Smażona zielona fasolka"` and `"Podawaj no gorqco lub na zimno"` survive dedup (neither is a substring of the other).
5. Result: `"Smażona zielona fasolka + Podawaj no gorqco lub na zimno"` — does not match expected `"Smażona zielona fasolka"`.

An alternative failure path (if embedding scores differ enough): the body-text candidate has a higher `thresholdScore` than `"Smażona zielona fasolka"`, inflating the threshold such that the title no longer passes `s.score >= threshold`. This would produce no result (or a fallback to the wrong candidate).

---

### Root cause summary

The `commonShort2` expansion fixed real title failures (Pattern 2, iter 18) but also **weakened the garbled-word filter for Polish body text**. Polish recipe instructions frequently use short prepositions (`na`, `po`, `za`, `od`). Adding them to the "not-garbled" whitelist correctly admits Polish title words, but also admits Polish cooking instructions as candidates.

The bilingual detection and other filters are not designed to handle this secondary effect. The consequence is a regression in a file that was previously correctly handled.

---

### Why this pattern affects only real files

Generated test files use English OCR content built from templates. The body text is English (e.g., "Beat egg whites until stiff peaks form"), which is filtered by `looksLikeCookingInstruction` (added in iter 19 — covering this exact scenario). Polish cooking instructions like `"Podawaj no gorqco lub na zimno"` do not start with English imperative verbs, so they bypass the cooking-instruction filter. Real files are more likely to contain Polish body text of this kind.

---

## No Other Patterns

Only one real file fails. There are no generated-file failures in this iteration. The single failure is fully explained by the mechanism above.

---

## Suggested Fix Direction

The problem is that `commonShort2` serves a dual purpose: it whitelists short words for the garbled-word check. Expanding it for Polish titles is correct, but it inadvertently whitelists the same short words that appear in Polish body text.

Two non-exclusive approaches:

1. **Extend `looksLikeCookingInstruction` to cover Polish imperative verbs** — add `Podawaj`, `Dodaj`, `Smaż`, `Gotuj`, `Odcedź`, etc. to the verb list. This would filter the specific body-text lines without touching the short-word logic.

2. **Add a position-based tiebreak for zero-ALL_CAPS multi-candidate results** — when `allCapsSelected.length === 0` and multiple mixed-case candidates survive, prefer the one at position 0 (or the earliest) rather than keeping all. The title is almost always near the top of the document; late-appearing body-text candidates should lose to position-0 candidates.

Option 2 is the safer general fix (it doesn't require enumerating Polish cooking verbs), but either would resolve this specific regression.

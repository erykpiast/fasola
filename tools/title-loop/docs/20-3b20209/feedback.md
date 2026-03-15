# Iteration 20 — Failure Analysis

## Overview

1 failure out of 11 real-file test cases (90.9% pass rate). The failure is a **regression**:
`SAFFRON WHEAT BUNS WITH QUARK : COTTAGE CHEESE (VARIATION D)` passed in iteration 19 and now
fails in iteration 20. The remaining 10 real files still pass.

---

## Pattern 1: 8-Word Filter Blocks `/`-Separated Variant Titles

**Affected file:** `SAFFRON WHEAT BUNS WITH QUARK : COTTAGE CHEESE (VARIATION D).real.txt` (real file)

**Affects:** Real files only (the 8-word filter is a new `passesHardFilters` guard added in
iteration 20; the generated test files that hit the 8-word range all use ` + ` or ` : `
separators, which are already whitelisted).

---

### What the file contains

The OCR page contains two variations of saffron buns from the same cookbook spread. The first
~53 lines are the body of Variation 1 (whose heading appears near the middle: `FRON WHEAT BUNS
(VARIATION 1)` — a truncated OCR fragment of "SAFFRON"). The target recipe starts at lines 54–55:

```
Line 54: SAFFRON WHEAT BUNS WITH QUARK
Line 55: / COTTAGE CHEESE (VARIATION D)
```

The test harness filename uses `:` as a filesystem-safe substitute for `/`, so the expected
title (after `normalize_separators` converts `:` → `/`) is:
`SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)`.

---

### Why iteration 19 passed

In iteration 19, `passesHardFilters` had no word-count ceiling. The continuation pre-merge step
(which merges a line into its predecessor when it starts with `/`, `&`, `+`, `:`, or `(`)
correctly merged lines 54–55 into a single candidate:

```
SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)
```

This candidate passed all hard filters, qualified as a structural heading (`isStructuralHeading`),
and scored well on embedding similarity. The algorithm returned it as the title.

---

### What iteration 20 changed

Iteration 20 added this guard to `passesHardFilters` (line 282):

```typescript
// Lines with ≥8 words are almost certainly body text, not titles.
// Exception: multi-title compounds with " + ", " : ", or " & " separators are allowed.
if (words.length >= 8 && !/ [+:&] /.test(text)) return false;
```

The merged title `SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)` has 10 words
(SAFFRON, WHEAT, BUNS, WITH, QUARK, /, COTTAGE, CHEESE, (VARIATION, D)). It fails the guard
because `/` is **not** in the separator exception set (`+`, `:`, `&`).

---

### Why the algorithm fails

1. The continuation pre-merge produces `"SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE (VARIATION D)"` as a single merged line.
2. `passesHardFilters` rejects it: 10 words ≥ 8, and the text contains ` / ` not ` + `, ` : `, or ` & `.
3. Because the pre-merge consumed line 55, `"SAFFRON WHEAT BUNS WITH QUARK"` alone never appears in `mergedLines` — there is no standalone 5-word candidate for this title either.
4. With the correct title absent from the candidate pool, the next-best structural heading is `"FRON WHEAT BUNS (VARIATION 1)"` — a truncated OCR fragment from the previous variation on the same page.
5. The truncation-detection code (which penalises "FRON" when "SAFFRON" is present as a longer candidate) cannot fire, because the full "SAFFRON…" candidate was eliminated before scoring.
6. The algorithm returns a wrong answer derived from the previous recipe's corrupted heading.

---

### Root cause summary

The 8-word filter was added to fix body-text leakage (long Polish cooking-instruction sentences
escaping into candidates after the `commonShort2` expansion). The fix is correct in principle,
but its separator-exception whitelist is incomplete. Cookbook titles often use ` / ` to separate
a base recipe from a named variation (e.g. "SAFFRON WHEAT BUNS WITH QUARK / COTTAGE CHEESE
(VARIATION D)"). The separator regex `/ [+:&] /` does not include `/`, so these legitimate
long titles are incorrectly discarded.

The fix is minimal: add `/` to the exception regex so that ` / ` is treated the same way as
` + `, ` : `, and ` & `:

```typescript
if (words.length >= 8 && !/ [+:&/] /.test(text)) return false;
```

---

## No Other Patterns

Only one real file fails. There are no generated-file failures in this iteration. The single
failure is fully explained by the incomplete separator whitelist in the 8-word guard.

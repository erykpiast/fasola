---
schema: 1
id: 18
title: "[P1.1] Port evaluation helpers (normalization + matching) to TypeScript"
status: done
created: "2026-03-29T19:38:30.830Z"
updated: "2026-03-29T19:46:26.825Z"
tags:
  - phase1
  - foundation
  - high-priority
  - medium
dependencies: []
---
## Description
Port string normalization and 6-level fuzzy title matching from analyze_bboxes.py lines 28-159 to TypeScript

## Details
Port string normalization and fuzzy matching functions from analyze_bboxes.py (lines 28-159) to lib/text-classifier/title-extractor-bbox.ts.

Functions to implement:

1. normalize(s: string): string — Collapse whitespace and uppercase
2. stripDiacritics(s: string): string — Remove Polish ł/Ł and Unicode combining diacritics via NFD normalization
3. ocrNormalize(s: string): string — OCR digit-letter confusion: 0→O, 1→I, 5→S
4. normForMatch(s: string): string — Full pipeline: normalize → strip quotes/apostrophes/pipes → replace hyphens/underscores → re-collapse → ocrNormalize(stripDiacritics())
5. levenshtein(a: string, b: string): number — Edit distance (dynamic programming, handle a.length < b.length by swapping)
6. titlesMatch(extracted: string | undefined, expected: string): boolean — 6-level fallback:
   Level 1: substring containment (all expected parts found in extracted)
   Level 2: word-set matching (handles reordering)
   Level 3: adjacent word-pair concatenation (e.g. "SHORT BREAD" → "SHORTBREAD")
   Level 4: fuzzy word matching (Levenshtein ≤1 for short words, ≤2 for words ≥5 chars)
   Level 5: suffix/prefix matching (OCR cropping, min 4 chars, ≥50% length overlap)
   Level 6: merged-word matching (short word ≤2 chars concatenated with next)

Expected parts split on "+" separator (compound titles like "ŻUREK+BARSZCZ").

normForMatch quote stripping regex: /["\u0027\u2018\u2019\u201C\u201D\u201E\u201F`]/g
Pipe replacement: | → I
Ampersand spacing: & → " & "
Hyphen/underscore: - and _ → space

Export normForMatch and titlesMatch (needed by comparison harness and tests).

## Validation
- [ ] normForMatch("Żurek") returns "ZUREK"
- [ ] normForMatch("Łosoś") returns "LOSOS"
- [ ] normForMatch("Z0PA") returns "ZOPA" (OCR: 0→O)
- [ ] normForMatch("P|EROG|") returns "PIEROGI" (pipe→I)
- [ ] levenshtein("kitten", "sitting") returns 3
- [ ] titlesMatch("ŻUREK", "ŻUREK") returns true (exact)
- [ ] titlesMatch("ZUREK", "ŻUREK") returns true (diacritics)
- [ ] titlesMatch("P1EROG1", "PIEROGI") returns true (OCR digits)
- [ ] titlesMatch("PIE BLUEBERRY", "BLUEBERRY PIE") returns true (reorder)
- [ ] titlesMatch("SHORTBREAD", "SHORT BREAD") returns true (adjacent pairs)
- [ ] titlesMatch("ZONE", "WĘDZONE") returns true (suffix match)
- [ ] titlesMatch("ŻUREK BARSZCZ", "ŻUREK+BARSZCZ") returns true (compound)
- [ ] titlesMatch(undefined, "ŻUREK") returns false
- [ ] File compiles: npx tsc --noEmit lib/text-classifier/title-extractor-bbox.ts
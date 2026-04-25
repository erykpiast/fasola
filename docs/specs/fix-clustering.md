# Fix Clustering Heuristics

## Problem

96.5% accuracy (389/403). All 14 failures are clustering failures — scoring never picks the wrong region when the right one exists. 2 of 14 are unsalvageable OCR garbage.

## Failure Breakdown

**Multi-recipe pages (6 cases):** IMG_1580, 1582, 1585, 1586, 1799, 1582. Two recipe titles on one page — the second title lands in a body-text region and doesn't get concatenated. The multi-recipe detection code (`multi_parts` logic) almost works but misses these.

**Title merged with metadata (4 cases):** IMG_1374, 1380, 1544, 1523. Title gets combined with section labels/metadata into one long region (e.g., "| Lato Tarty TARTA Z CUKINIĄ DLA 4 OSOB PRZYGOTOWANIE 20 MIN..."). `_strip_trailing_ingredients` and `_extract_leading_title` don't handle these patterns.

**Title split across regions (2 cases):** IMG_1750, 3821/3822. Title fragments land in separate regions and `_merge_stacked_title_lines` doesn't reconnect them.

**OCR garbage (2 cases):** IMG_1417, 1418. Unsalvageable.

## Approach

Surgical heuristic fixes in `analyze_bboxes.py` (Python) + `title-extractor-bbox.ts` (TS port). No ML. Use `diagnose_failures.py` to validate each fix.

## Goal

~98-99% accuracy (400+/403).

## Diagnostic

`tools/title-loop/diagnose_failures.py` separates clustering failures from scoring failures. Run it to validate fixes don't regress.

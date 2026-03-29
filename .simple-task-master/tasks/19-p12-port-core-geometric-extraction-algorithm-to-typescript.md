---
schema: 1
id: 19
title: "[P1.2] Port core geometric extraction algorithm to TypeScript"
status: done
created: "2026-03-29T19:39:21.945Z"
updated: "2026-03-29T19:46:27.013Z"
tags:
  - phase1
  - core
  - high-priority
  - large
dependencies:
  - 18
---
## Description
Port heuristic 5 (region clustering, scoring, validation, multi-recipe detection) from analyze_bboxes.py to TypeScript — the main algorithm body

## Details
Port heuristic 5 (region clustering + scoring + validation) from analyze_bboxes.py to lib/text-classifier/title-extractor-bbox.ts. This is the main algorithm body (~600 lines of Python).

Types to define:

interface BboxObservation {
  text: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
}
interface BboxInput {
  image: string;
  observations: Array<BboxObservation>;
}
interface Region {
  observations: Array<BboxObservation>;
  bbox: { x: number; y: number; width: number; height: number };
  lines: number;
  text: string;
  char_density: number;
  mean_line_height: number;
}

Functions to port (analyze_bboxes.py line references):

1. detectColumns(observations, minGap=0.025) — lines 405-460
   Tests X-axis split positions. Sorts observations by bbox.x, finds gaps, scores each candidate split by count of observations cleanly in left vs right vs straddling.

2. findSameYGroups(observations, yTolerance=0.03, heightRatio=0.5) — lines 338-370
   Groups observations on same horizontal band. Python uses defaultdict(list) — use Map with lazy init.

3. clusterColumn(observations, yTolerance, regionGap) — lines 540-722 (~180 lines, LARGEST function)
   Per-column clustering: sort by Y → group into bands → sub-split bands by height similarity (ratio > 0.8) → merge adjacent bands (gap < regionGap, X overlap > 50%, height ratio > 0.8, width ratio > 0.5) → compute region properties (bbox union, line count, text concatenation, char density, mean line height).
   Python statistics.mean() → implement as arr.reduce((a,b)=>a+b,0)/arr.length.

4. clusterIntoRegions(observations, yTolerance=0.05, regionGap=0.04) — lines 462-538
   Calls detectColumns, then clusterColumn per column (or full set if no columns). Then calls mergeStackedTitleLines on result.

5. mergeStackedTitleLines(regions) — lines 470-538
   Post-merge: combine multi-line title blocks by left-edge alignment (x_bucket quantized to 0.05, tolerance 0.03). Merge conditions: current region small (≤2 lines, <40 chars), previous not huge (≤10 lines, <250 chars), height ratio ≥ 0.4, vertical gap < 0.08, left edges aligned.
   Python id(r) for set → use array index instead.

6. scoreTitleRegion(region, allRegions) — lines 725-790
   6-feature scoring + gutter penalty:
   - line_count (0.20): n≤1→0.75, n≤3→1.0, n≤6→max(0.2, 1-(n-3)/5), else→0.1
   - relative_line_height (0.15): region.mean_line_height / max(all)
   - vertical_position (0.25): y<0.3→1.0, y<0.5→0.5, else→0.1
   - char_density (0.10): 1 - min(region.density/max(all), 1)
   - text_length (0.05): max(0, 1 - len/100)
   - caps_boost (0.15): (upper_ratio>0.8 ? 1.0 : 0.0) * relative_line_height
   - width_score (0.10): min(width/0.30, 1.0)
   - gutter_penalty: -0.3 if mean_line_height>0.035 AND width<0.20 AND x<0.10

7. validateTitleText(text) — lines 793-809
   Reject if: len<4 or >200, ends with period, matches MEASUREMENT_RE, cleaned text in SECTION_LABELS set, matches RECIPE_METADATA_RE.
   MEASUREMENT_RE: /\d+\s*(g|ml|kg|cup|cups|tbsp|tsp|tablespoon|teaspoon|oz|ounce|lb|pound|piece|pieces|clove|cloves|bunch|can|jar|bottle|slice|slices|łyżka|łyżki|łyżeczka|łyżeczki|szklanka|szklankę|szklanki|plaster|plastry|ząbek|ząbków|ząbki|opakowanie|puszka|puszki|sztuka|sztuk|sztuki)\b/i
   SECTION_LABELS: 34 entries (ingredients, directions, instructions, method, preparation, steps, notes, tip, tips, garnish, topping, sauce, dressing, glaze, filling, frosting, crust, batter, skladniki, przygotowanie, wykonanie, sposob przygotowania, sposob wykonania, sos, polewa, krem, nadzienie, ciasto, dekoracja, marynata, dodatki)
   RECIPE_METADATA_RE: /DLA\s+\d+\s+OSOB|GOTOWANIE|SERVES?\s+\d|MAKES?\s+\d|YIELD|PIECZENIE|CZAS|NA\s+\d+\s+(PORCJ|OSOB|PAPRYKI|SZTUK)/i

8. stripTrailingIngredients(text) — lines 812-827
   Find first MEASUREMENT_RE match, take text before it, strip trailing numbers, return if ≥4 chars.

9. extractLeadingTitle(region) — lines 830-864
   Sort observations by (round(y,2), x). First obs must be ≤60 chars, ≥4 chars, start with uppercase, not end with period. Collect same-Y-band observations (y_tol=0.03, each ≤40 chars). Join with space.

10. extractTitleFromBboxes(input) — port of heuristic_region_clustering() lines 867-1070 (~200 lines)
    Main entry: cluster → score all regions → greedy multi-region merge (start with best ≥0.55, absorb nearby ≥0.50 within vertical gap <0.10, short text ≤50 chars, horizontal overlap or close proximity, not recipe metadata) → if no merged title, try top 3 individually → for regions >200 chars, try extractLeadingTitle → validate with validateTitleText → strip trailing ingredients → multi-recipe detection (find additional title-like regions) → observation-level subtitle scan (short ALL_CAPS with Y gaps) → deduplicate → return primary + additional titles joined with " + ".

Public export: extractTitleFromBboxes(input: BboxInput): string | undefined

## Validation
- [ ] All 10 functions ported with logic matching Python exactly
- [ ] Scoring weights match: [0.20, 0.15, 0.25, 0.10, 0.05, 0.15, 0.10] - 0.30 gutter
- [ ] Regex patterns (MEASUREMENT_RE, RECIPE_METADATA_RE) match Python
- [ ] SECTION_LABELS set contains all 34 entries (after stripDiacritics + lowercase)
- [ ] Region properties computed correctly: bbox union, line count, text concat, char_density, mean_line_height
- [ ] Multi-region merge respects all conditions (score ≥0.55/0.50, gap <0.10, text ≤50 chars, overlap)
- [ ] Stacked title merge conditions match: ≤2 lines + <40 chars, height ratio ≥0.4, gap <0.08, left-aligned within 0.03
- [ ] Column detection finds correct split points
- [ ] File compiles: npx tsc --noEmit lib/text-classifier/title-extractor-bbox.ts
- [ ] Exports extractTitleFromBboxes as public API
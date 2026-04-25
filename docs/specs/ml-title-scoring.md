# ML Title Scoring

## Problem

The current `scoreTitleRegion` is a hand-tuned linear model (7 features, hand-picked weights). `validateTitleText` uses language-specific regex and section label lists. Both are fragile when encountering new languages or layout styles. The goal is to replace them with a learned model that generalizes without manual tuning.

## Architecture

Pairwise ranking with gradient-boosted trees.

**Why pairwise over pointwise:** Learns relative comparisons ("prefer the larger-font, shorter-text region") rather than absolute thresholds. Richer training signal — each page with N regions gives O(N^2) training pairs. Transfers across languages because features are ratios/differences, not absolute values.

**Why GBT over neural nets:** Handles heterogeneous features naturally (ratios, booleans, counts). Thrives on the available data size (~400 pages x ~5 regions x pairwise = thousands of pairs). Trivially compiles to TS if/else trees for on-device inference.

## Features (per pair: region A vs region B)

- Height ratio (A.mean_line_height / B.mean_line_height)
- Vertical position difference
- Text length ratio
- Character density ratio
- Line count ratio
- Width ratio
- Caps ratio difference
- Digit/punctuation ratio difference
- Has-measurement boolean (replaces regex)
- Has-period-ending boolean (replaces sentence heuristic)

All features are ratios or differences — language-agnostic by construction.

## Runtime

- GBT compiles to a TypeScript if/else function. Zero dependencies.
- Inference: microseconds. Model size: <1KB for a 50-tree ensemble.
- Constraints: <1s, <20MB (well within budget).

## Training Pipeline

1. Python (scikit-learn or LightGBM) offline.
2. Auto-derive labels: run clustering on existing 403 ground truth images, match regions to expected titles, label positive/negative.
3. Export as JSON tree structure.
4. Codegen into TypeScript.
5. Retrain when new labeled data is added.

## Scope

Replaces: `scoreTitleRegion`, `validateTitleText`, `_SECTION_LABELS`, `_MEASUREMENT_RE`, `_RECIPE_METADATA_RE`, all language-specific rules.

Keeps: Geometric clustering (`clusterIntoRegions`, `detectColumns`, `_mergeStackedTitleLines`) — these are language-agnostic and work well.

## Open Questions

- Bootstrap training data with VLM labeling to scale beyond 403 images?
- At what dataset size does it make sense to also learn clustering merge decisions?
- Should the multi-recipe detection be a separate model or folded into the pairwise ranker?

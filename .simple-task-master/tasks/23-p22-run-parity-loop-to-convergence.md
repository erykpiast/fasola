---
schema: 1
id: 23
title: "[P2.2] Run parity loop to convergence"
status: done
created: "2026-03-29T19:40:24.315Z"
updated: "2026-03-29T20:27:01.821Z"
tags:
  - phase2
  - execution
  - high-priority
  - large
dependencies:
  - 22
---
## Description
Execute bbox-parity-loop.py, monitor progress, achieve 0 divergences on all 407 images

## Details
Run: MPLBACKEND=Agg python3 tools/title-loop/bbox-parity-loop.py. Monitor iteration progress — each iteration should reduce divergences. Loop converges when Claude fixes all remaining issues. If loop stalls (same divergence count for 3+ iterations), review the failures manually and provide hints. Expected: initial port has many divergences, converges over 5-15 iterations.

## Validation
0 divergences on all 407 bbox JSON files. TypeScript output matches Python output exactly for every image. All changes committed with descriptive messages. python3 tools/title-loop/compare-implementations.py exits with code 0.
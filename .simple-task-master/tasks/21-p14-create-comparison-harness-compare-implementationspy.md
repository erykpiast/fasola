---
schema: 1
id: 21
title: "[P1.4] Create comparison harness (compare-implementations.py)"
status: done
created: "2026-03-29T19:39:45.646Z"
updated: "2026-03-29T19:47:19.492Z"
tags:
  - phase1
  - tooling
  - high-priority
  - medium
dependencies:
  - 20
---
## Description
Python script that runs both Python and TypeScript on all 407 bbox files and outputs title-string divergences

## Details
Create tools/title-loop/compare-implementations.py — Python script that runs both Python and TypeScript implementations on all 407 bbox files and outputs divergences.

File: tools/title-loop/compare-implementations.py

Process:
1. Load tools/title-loop/bboxes/_all.json (array of {image, observations})
2. For each entry:
   a. Run Python: call heuristic_region_clustering(observations) directly (import from analyze_bboxes)
   b. Run TypeScript: write temp JSON, invoke npx tsx tools/title-loop/extract-bbox.ts via subprocess (30s timeout)
   c. Compare title strings (exact match)
3. Output summary to stdout: parity count, divergence count, first 20 examples
4. Write full failure list to tools/title-loop/bboxes/_parity_failures.json

TypeScript invocation:
```python
result = subprocess.run(
    ["npx", "tsx", str(LOOP_DIR / "extract-bbox.ts"), bbox_json_path],
    capture_output=True, text=True, timeout=30,
    cwd=str(PROJECT_ROOT),
)
ts_title = result.stdout.strip()
```

Failure format:
```json
[
  {"image": "IMG_1358", "python_title": "ŻUREK", "ts_title": "ZUREK Z KIEŁBASĄ"},
  ...
]
```

Exit code: 0 when 0 divergences, 1 otherwise.

Temp files: write to bboxes/_temp_{image}.json, clean up after each comparison.

## Validation
Runs both implementations on all 407 images. Outputs divergence count to stdout. Writes _parity_failures.json. Exit code 0 when 0 divergences. Each TS invocation has 30s timeout. Temp files cleaned up.
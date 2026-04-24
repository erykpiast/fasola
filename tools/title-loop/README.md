# title-loop

Bounding box title extraction — geometric/spatial approach to identifying recipe titles from OCR bounding box coordinates.

See [BBOX-PIPELINE.md](BBOX-PIPELINE.md) for the full architecture and data flow.

## Scripts

| Script | Purpose |
|--------|---------|
| `recognize_bboxes.py` | OCR recipe photos via Apple Vision, capture bounding boxes and confidence per text observation |
| `analyze_bboxes.py` | Spatial clustering and title region scoring from bbox layout (~1600 lines) |
| `bbox-loop.py` | Self-improving loop: evaluate → Claude Code fixes → commit (target: 95%+ PL/EN) |
| `bbox-parity-loop.py` | Autonomous loop to fix TypeScript port divergences vs Python |
| `compare-implementations.py` | Compare Python vs TypeScript (`title-extractor-bbox.ts`) outputs |
| `extract-bbox.ts` | TypeScript CLI — single image bbox title extraction |
| `extract-bbox-batch.ts` | TypeScript CLI — batch bbox title extraction |
| `run_bbox_analysis.sh` | Wrapper: recognize_bboxes.py → analyze_bboxes.py |

## Directory structure

```
tools/title-loop/
├── README.md
├── BBOX-PIPELINE.md              # Detailed architecture docs
├── recognize_bboxes.py           # Apple Vision OCR → bbox JSON
├── analyze_bboxes.py             # Spatial clustering + scoring
├── bbox-loop.py                  # Self-improving loop orchestrator
├── bbox-parity-loop.py           # Python/TS parity fixer
├── compare-implementations.py    # Python vs TS divergence detector
├── extract-bbox.ts               # Single-image TS CLI
├── extract-bbox-batch.ts         # Batch TS CLI
├── run_bbox_analysis.sh          # Wrapper script
├── input/*.real.txt              # Ground truth (filename = title)
├── bboxes/                       # Cached bbox observations
│   ├── _all.json                 # Combined (407 images)
│   └── {IMAGE_STEM}.json         # Per-image observations
└── docs/
    ├── bbox-loop/                # Bbox loop iteration history
    └── parity-loop/              # TS parity loop history
```

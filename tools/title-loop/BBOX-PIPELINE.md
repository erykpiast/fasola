# Bounding Box Title Extraction Pipeline

How the self-improving geometric title extraction loop works.

## Architecture Overview

```
                     ┌─────────────────────────────────────┐
                     │         bbox-loop.py (Python)        │
                     │    Orchestrator — runs unattended    │
                     └──────────┬──────────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
   ┌─────────────┐    ┌─────────────────┐    ┌──────────────┐
   │  Evaluate    │    │  Claude Code    │    │  Visualize   │
   │  (in-process)│    │  (subprocess)   │    │  (in-process)│
   │              │    │                 │    │              │
   │ analyze_     │    │ claude --print  │    │ recognize_   │
   │ bboxes.py    │    │ --dangerously-  │    │ bboxes.py    │
   │ imported as  │    │ skip-permissions│    │ draw_visual- │
   │ Python module│    │                 │    │ ization()    │
   └─────────────┘    └─────────────────┘    └──────────────┘
```

## Data Flow Per Iteration

```
Step 1: EVALUATE (instant, <1s)
  ┌──────────────────┐
  │ bboxes/_all.json  │──→ cluster_into_regions() ──→ score_title_region()
  │ (407 images,      │         │                          │
  │  cached bbox data)│         ▼                          ▼
  └──────────────────┘    group into regions         pick best title
                               │                          │
  ┌──────────────────┐         │                          │
  │ input/*.real.txt  │──→ titles_match() ◄───────────────┘
  │ (ground truth,    │         │
  │  415 files)       │         ▼
  └──────────────────┘    results.json: accuracy, failure list

Step 2: ANALYZE + FIX (5-30 min)
  ┌─────────────────────────────────────────────┐
  │  Prompt (built by bbox-loop.py):            │
  │  • Current accuracy numbers                 │
  │  • 15 failure examples (image, expected,    │
  │    extracted)                                │
  │  • Full iteration history from log.md       │
  │  • Instructions: read bbox JSONs, identify  │
  │    failure pattern, make ONE fix             │
  └─────────────────┬───────────────────────────┘
                    │ stdin (piped)
                    ▼
  ┌─────────────────────────────────────────────┐
  │  Claude Code (headless subprocess)          │
  │  Model: Sonnet 4.6 (configurable)           │
  │  Flags: --print --dangerously-skip-perms    │
  │                                             │
  │  Claude has FULL tool access:               │
  │  • Read bbox JSON files from disk           │
  │  • Read/Edit analyze_bboxes.py              │
  │  • Run Python evaluation commands           │
  │  • Git commit changes                       │
  │                                             │
  │  Claude does NOT use skills (/brainstorm,   │
  │  /spec:create etc.) — it's a focused code   │
  │  fix session, not a planning session.       │
  └─────────────────┬───────────────────────────┘
                    │ stdout (stream-json)
                    ▼
  bbox-loop.py captures output, detects stalls

Step 3: RE-EVALUATE (instant, <1s)
  Same as Step 1 but with updated analyze_bboxes.py
  (force-reimported to pick up Claude's changes)

Step 4: VISUALIZE (optional, ~30s)
  ┌──────────────────┐     ┌──────────────────┐
  │ bboxes/IMG_*.json │     │ example-recipes/  │
  │ (raw bbox data)   │     │ IMG_*.HEIC        │
  └────────┬──────────┘     └────────┬──────────┘
           │                         │
           ▼                         ▼
     cluster_into_regions()    load via NSImage
           │                         │
           ▼                         ▼
     draw on image: blue boxes (observations)
                    yellow/green boxes (regions)
           │
           ▼
     bboxes/visualized/IMG_*.png (top 20 failures)

Step 5: LOG
  Append to docs/bbox-loop/log.md:
  • Accuracy before/after
  • Fix summary (last line of Claude's output)
  • Per-language breakdown
```

## What Claude Receives vs What Claude Queries

| Data | Delivered in prompt | Claude reads from disk |
|------|--------------------|-----------------------|
| Accuracy numbers | Yes (pre-computed) | No |
| Failure list (15 examples) | Yes (image name, expected, extracted) | No |
| Spatial layout summaries (5 images) | Yes (regions, scores, positions) | No |
| Iteration history | Yes (full log.md content) | No |
| Visualization PNGs | Referenced in prompt | Yes (Claude reads 2-3 PNGs to see page layouts) |
| Bbox JSON for specific images | No | Yes (Claude reads files it chooses) |
| analyze_bboxes.py source | No | Yes (Claude reads before editing) |

**Claude's autonomy:** Claude reads visualization PNGs to see actual page layouts with observation and region overlays, reads bbox JSONs for coordinate details, identifies the dominant failure pattern, edits the code, runs the evaluation command to verify, and commits. The prompt provides failure examples, spatial summaries, and history as starting context.

## Models

| Role | Model | Why |
|------|-------|-----|
| Analysis + implementation | **Opus 4.6** (default) | Best spatial reasoning from coordinate data; 19 points to close is hard |
| Can be changed to | Sonnet 4.6 | Set `CLAUDE_MODEL = "sonnet"` for faster but less capable iterations |
| Not used | Haiku | Too weak for multi-step code analysis |

No separate model for analysis vs implementation — it's one Claude session per iteration that does both.

## Persistent State

```
tools/title-loop/docs/bbox-loop/
├── log.md                    # Iteration history (survives across runs)
│   ├── ## Iteration 1
│   │   ├── accuracy, PL, EN
│   │   ├── fix summary
│   │   └── delta
│   ├── ## Iteration 2
│   └── ...
├── iter-1/
│   ├── results.json          # Full evaluation results
│   ├── claude_output.txt     # Raw stream-json from Claude
│   └── claude_response.md    # Claude's final text response
├── iter-2/
└── ...
```

**log.md is the memory.** It's passed to Claude in every iteration prompt so it knows what was already tried. This prevents repeating failed approaches. If the log grows too large, it can be manually trimmed to keep only the last N iterations.

## Stall Detection & Recovery

- If Claude produces no output for 3 minutes → killed (ClaudeStallError)
- If total session exceeds 30 minutes → killed (RuntimeError)
- On stall/failure: iteration is logged as "CLAUDE FAILED" and the loop continues to the next iteration
- The loop is resumable: `get_last_iteration()` reads log.md to find where to continue

## What This Pipeline Does NOT Do

- **No planning skills** (`/brainstorm`, `/spec:create`): This is a tight fix loop, not architectural exploration
- **No OCR re-processing from images**: Claude views pre-rendered visualization PNGs but does not run OCR
- **No model training**: Pure rule-based clustering improvements
- **No OCR re-processing**: Bbox data is pre-computed and cached; only the clustering algorithm changes
- **No web search**: Fully offline

## Running

```bash
# Prerequisites: bbox data must exist
python3 recognize_bboxes.py --dewarp

# Run the loop (overnight, unattended)
MPLBACKEND=Agg python3 bbox-loop.py

# With visualization updates (slower but lets you inspect)
MPLBACKEND=Agg python3 bbox-loop.py --visualize

# Check progress
cat tools/title-loop/docs/bbox-loop/log.md
```

---
schema: 1
id: 22
title: "[P2.1] Create autonomous parity loop (bbox-parity-loop.py)"
status: done
created: "2026-03-29T19:40:16.892Z"
updated: "2026-03-29T19:48:20.692Z"
tags:
  - phase2
  - core
  - high-priority
  - large
dependencies:
  - 20
  - 21
---
## Description
Python script that iteratively runs comparison harness, feeds divergences to Claude Code headless, with compile-check, stall detection, regression guard, and retry logic

## Details
Create tools/title-loop/bbox-parity-loop.py — autonomous loop that iteratively runs the comparison harness and feeds divergences to Claude Code headless for fixing.

Reuse proven patterns from tools/title-loop/bbox-loop.py:
- ClaudeStallError exception class (line 212)
- run_claude() function with stream-json parsing, threaded stdout reader, stall detection, hard timeout (lines 216-299)
- Iteration logging pattern

Configuration:
MAX_ITERATIONS = 20
PARITY_THRESHOLD = 1.0 (100% parity target)
CLAUDE_TIMEOUT = 1800 (30 min per session)
CLAUDE_STALL_TIMEOUT = 180 (kill if no output for 3 min)
CLAUDE_MAX_RETRIES = 3
CLAUDE_MODEL = "opus"
TS_FILE = "lib/text-classifier/title-extractor-bbox.ts"
PY_FILE = "tools/title-loop/analyze_bboxes.py"

Loop steps per iteration:
1. Compile check: npx tsc --noEmit {TS_FILE}
   - If fails, build prompt with compile errors, send to Claude, continue to next iteration
2. Run comparison: python3 tools/title-loop/compare-implementations.py
   - Parse stdout for divergence count
   - If 0 → print "PARITY ACHIEVED!", exit 0
3. Read _parity_failures.json, pick up to 15 diverse failures
4. Build parity fix prompt (see template below)
5. Launch Claude Code headless with retry (up to CLAUDE_MAX_RETRIES):
   cmd = ["claude", "--print", "--dangerously-skip-permissions", "--verbose",
          "--output-format", "stream-json", "--include-partial-messages",
          "--model", "claude-opus-4-6"]
   Send prompt via stdin, close stdin
6. After Claude finishes, run comparison again (regression check)
   - If new failures > old failures: revert with git checkout {TS_FILE}, log regression, continue
7. Log iteration: iteration number, old divergence count, new divergence count

Prompt template for parity fixes:
"""You are fixing the TypeScript port of a Python bbox title extraction algorithm.

## Parity status
Divergences: {count} out of 407 images

## Divergence examples (iteration {N})
  - {image}: python="{py_title}" typescript="{ts_title}"
  [up to 15 examples]

## Your task
1. Read both source files:
   - Python reference: tools/title-loop/analyze_bboxes.py (CORRECT implementation)
   - TypeScript port: lib/text-classifier/title-extractor-bbox.ts (file to FIX)
2. For 2-3 failure images, read bbox JSON from tools/title-loop/bboxes/{IMAGE}.json
3. Trace through both implementations to find where they diverge
4. Make a SINGLE targeted fix to the TypeScript file
5. Verify: python3 tools/title-loop/compare-implementations.py
6. Commit with a descriptive message

## Rules
- Only modify lib/text-classifier/title-extractor-bbox.ts
- Python is GROUND TRUTH — never change it
- ONE fix per iteration
- Commit changes after fixing
"""

Prompt template for compile fixes:
"""The TypeScript bbox title extraction file has compile errors. Fix them.
## Compile errors
{stderr}
## Your task
1. Read lib/text-classifier/title-extractor-bbox.ts
2. Fix the compile errors
3. Verify: npx tsc --noEmit lib/text-classifier/title-extractor-bbox.ts
4. Commit the fix
"""

Logging: write to tools/title-loop/docs/parity-loop/log.md
Per-iteration data: tools/title-loop/docs/parity-loop/iter-{N}/

Usage: MPLBACKEND=Agg python3 tools/title-loop/bbox-parity-loop.py

## Validation
- [ ] Compile-check runs before comparison (prevents wasted iterations on syntax errors)
- [ ] Comparison detects divergences and feeds to Claude Code headless
- [ ] Claude invoked with: claude --print --dangerously-skip-permissions --verbose --output-format stream-json --include-partial-messages --model claude-opus-4-6
- [ ] Stall detection kills Claude after 180s of inactivity
- [ ] Hard timeout at 1800s per session
- [ ] Retries up to 3 times on stall/failure
- [ ] Regression detection: if new failures > old failures, reverts TS file with git checkout
- [ ] Logs iteration progress (divergence count before/after)
- [ ] Exits with code 0 when 0 divergences achieved
- [ ] Prompt includes up to 15 failure examples with Python vs TypeScript titles
- [ ] Prompt instructs Claude to read both source files and make ONE fix
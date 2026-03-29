#!/usr/bin/env python3
"""
Autonomous parity loop for TypeScript port of bbox title extraction.

Each iteration:
1. Compile-checks the TypeScript file
2. Runs compare-implementations.py to find divergences
3. Feeds divergences to Claude Code headless to fix the TypeScript
4. Regression-checks and commits or reverts

Exits when 0 divergences (100% parity) or MAX_ITERATIONS reached.

Usage: MPLBACKEND=Agg python3 tools/title-loop/bbox-parity-loop.py
"""

import argparse
import json
import os
import re
import subprocess
import sys
import threading
import time
from pathlib import Path

# --- Configuration ---
MAX_ITERATIONS = 20
CLAUDE_TIMEOUT = 1800  # 30 minutes per Claude session
CLAUDE_STALL_TIMEOUT = 180  # kill if no output for 3 minutes
CLAUDE_MAX_RETRIES = 3
CLAUDE_MODEL = "opus"

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
LOOP_DIR = Path(__file__).resolve().parent
TS_FILE = "lib/text-classifier/title-extractor-bbox.ts"
PY_FILE = "tools/title-loop/analyze_bboxes.py"


def set_model(model: str):
    global CLAUDE_MODEL
    CLAUDE_MODEL = model
FAILURES_JSON = LOOP_DIR / "bboxes" / "_parity_failures.json"
DOCS_DIR = LOOP_DIR / "docs" / "parity-loop"
LOG_FILE = DOCS_DIR / "log.md"


# --- Claude Code headless (adapted from bbox-loop.py) ---


class ClaudeStallError(Exception):
    pass


def run_claude(prompt: str, log_path: Path | None = None) -> str:
    """Run Claude Code headless with streaming and stall detection."""
    cmd = [
        "claude",
        "--print",
        "--dangerously-skip-permissions",
        "--verbose",
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--model",
        {
            "opus": "claude-opus-4-6",
            "sonnet": "claude-sonnet-4-6",
            "haiku": "claude-haiku-4-5-20251001",
        }.get(CLAUDE_MODEL, "claude-sonnet-4-6"),
    ]

    start = time.time()
    raw_lines: list[str] = []
    result_text = ""
    last_activity = time.time()
    reader_done = threading.Event()
    lock = threading.Lock()

    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        cwd=str(PROJECT_ROOT),
    )

    # Send prompt
    proc.stdin.write(prompt.encode())
    proc.stdin.close()

    def reader():
        nonlocal result_text, last_activity
        for raw_line in proc.stdout:
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            with lock:
                raw_lines.append(line)
                last_activity = time.time()
            try:
                msg = json.loads(line)
                if msg.get("type") == "result":
                    with lock:
                        result_text = msg.get("result", "")
            except json.JSONDecodeError:
                pass
        reader_done.set()

    t = threading.Thread(target=reader, daemon=True)
    t.start()

    # Monitor for stalls and timeout
    while not reader_done.is_set():
        reader_done.wait(timeout=5)
        elapsed = time.time() - start
        with lock:
            idle = time.time() - last_activity

        if elapsed > CLAUDE_TIMEOUT:
            proc.kill()
            raise RuntimeError(f"Claude timed out after {elapsed:.0f}s")
        if idle > CLAUDE_STALL_TIMEOUT:
            proc.kill()
            raise ClaudeStallError(f"Claude stalled for {idle:.0f}s")

        # Print progress
        minutes = int(elapsed) // 60
        seconds = int(elapsed) % 60
        print(f"\r  Claude running... {minutes}m{seconds:02d}s", end="", flush=True)

    proc.wait()
    print()  # newline after progress

    if log_path:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text("\n".join(raw_lines))

    if proc.returncode != 0 and not result_text:
        raise RuntimeError(f"Claude exited with code {proc.returncode}")

    return result_text


# --- Compile check ---


def compile_check() -> tuple[bool, str]:
    """Run tsc --noEmit on the TypeScript file. Returns (success, errors)."""
    result = subprocess.run(
        ["npx", "tsc", "--noEmit", "--project", "tsconfig.json"],
        capture_output=True,
        text=True,
        cwd=str(PROJECT_ROOT),
        timeout=60,
    )
    # Filter errors to only those in our file
    errors = []
    for line in result.stderr.splitlines() + result.stdout.splitlines():
        if TS_FILE in line:
            errors.append(line)
    if errors:
        return False, "\n".join(errors)
    return result.returncode == 0, result.stdout + result.stderr


# --- Comparison ---


def run_comparison() -> list[dict]:
    """Run compare-implementations.py and return failures list."""
    result = subprocess.run(
        ["python3", str(LOOP_DIR / "compare-implementations.py")],
        capture_output=True,
        text=True,
        cwd=str(PROJECT_ROOT),
        timeout=600,  # 10 min for all 407 images
    )
    print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)

    # Read failures JSON
    if FAILURES_JSON.exists():
        return json.loads(FAILURES_JSON.read_text())
    return []


# --- Prompts ---


def build_parity_prompt(iteration: int, failures: list[dict], history: str) -> str:
    """Build prompt for fixing TypeScript divergences."""
    failure_text = "\n".join(
        f'  - {f["image"]}: python="{f["python_title"][:80]}" typescript="{f["ts_title"][:80]}"'
        for f in failures[:15]
    )

    return f"""You are fixing the TypeScript port of a Python bbox title extraction algorithm to achieve exact output parity.

## Parity status

Divergences: {len(failures)} out of ~407 images

## Divergence examples (iteration {iteration})

{failure_text}

Total divergences: {len(failures)}

## Previous iterations

{history if history else "(first iteration)"}

## Your task

1. Read both source files:
   - Python reference (GROUND TRUTH): {PY_FILE}
   - TypeScript port (file to FIX): {TS_FILE}
2. For 2-3 failure images, read the bbox JSON from tools/title-loop/bboxes/{{IMAGE}}.json
3. Trace through both implementations to find where they diverge
4. Make a SINGLE targeted fix to the TypeScript file
5. Verify by running: python3 tools/title-loop/compare-implementations.py
6. Commit with a descriptive message explaining what divergence you fixed

## Rules

- Only modify {TS_FILE}
- The Python implementation is the GROUND TRUTH — NEVER change it
- Make ONE fix per iteration, not multiple unrelated changes
- If you can't reduce divergences, explain why and suggest a different approach
- Commit changes after fixing

## Important context

- Bounding boxes are portrait-normalized (EXIF rotation applied before OCR)
- y=0 is top of page, y=1 is bottom
- height = line height (font size proxy)
- The Python uses default params y_tolerance=0.05, region_gap=0.04 for heuristic_region_clustering
- Compare title STRINGS only — float score differences don't matter as long as the same title wins
"""


def build_compile_fix_prompt(errors: str) -> str:
    """Build prompt for fixing TypeScript compile errors."""
    return f"""The TypeScript bbox title extraction file has compile errors. Fix them.

## Compile errors

{errors}

## Your task

1. Read {TS_FILE}
2. Fix the compile errors
3. Verify with: npx tsc --noEmit --project tsconfig.json
4. Commit the fix
"""


# --- Iteration logging ---


def log_iteration(iteration: int, old_count: int, new_count: int, notes: str = ""):
    """Append iteration summary to log.md."""
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    entry = f"\n## Iteration {iteration}\n\n"
    entry += f"- Divergences before: {old_count}\n"
    entry += f"- Divergences after: {new_count}\n"
    if notes:
        entry += f"- Notes: {notes}\n"
    entry += f"- Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}\n"

    if LOG_FILE.exists():
        LOG_FILE.write_text(LOG_FILE.read_text() + entry)
    else:
        LOG_FILE.write_text(f"# Parity Loop Log\n{entry}")


def get_history() -> str:
    """Read iteration history from log.md."""
    if LOG_FILE.exists():
        return LOG_FILE.read_text()
    return ""


# --- Main loop ---


def run_iteration(iteration: int) -> bool:
    """Run one parity iteration. Returns True if parity achieved."""
    iter_dir = DOCS_DIR / f"iter-{iteration}"
    iter_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"PARITY ITERATION {iteration}")
    print(f"{'='*60}")

    # Step 1: Compile check
    print("\n--- Step 1: Compile check ---")
    ok, errors = compile_check()
    if not ok:
        print(f"  Compile errors found, sending to Claude...")
        prompt = build_compile_fix_prompt(errors)
        for attempt in range(CLAUDE_MAX_RETRIES):
            try:
                run_claude(prompt, log_path=iter_dir / "claude_compile.txt")
                break
            except (ClaudeStallError, RuntimeError) as e:
                print(f"  Attempt {attempt + 1} failed: {e}")
        # Re-check
        ok, errors = compile_check()
        if not ok:
            log_iteration(iteration, -1, -1, f"COMPILE FAILED: {errors[:200]}")
            return False

    # Step 2: Run comparison
    print("\n--- Step 2: Running comparison ---")
    failures = run_comparison()
    old_count = len(failures)

    if old_count == 0:
        print("\n  🎉 PARITY ACHIEVED! 0 divergences.")
        log_iteration(iteration, 0, 0, "PARITY ACHIEVED")
        return True

    print(f"\n  {old_count} divergences remaining")

    # Save failures
    (iter_dir / "failures.json").write_text(
        json.dumps(failures, indent=2, ensure_ascii=False)
    )

    # Step 3: Send to Claude
    print("\n--- Step 3: Sending to Claude ---")
    history = get_history()
    prompt = build_parity_prompt(iteration, failures, history)

    claude_success = False
    for attempt in range(CLAUDE_MAX_RETRIES):
        try:
            run_claude(prompt, log_path=iter_dir / "claude_output.txt")
            claude_success = True
            break
        except (ClaudeStallError, RuntimeError) as e:
            print(f"  Attempt {attempt + 1} failed: {e}")

    if not claude_success:
        log_iteration(iteration, old_count, old_count, "CLAUDE FAILED after retries")
        return False

    # Step 4: Regression check
    print("\n--- Step 4: Regression check ---")
    new_failures = run_comparison()
    new_count = len(new_failures)

    if new_count > old_count:
        print(
            f"  REGRESSION: {old_count} → {new_count} divergences, reverting..."
        )
        subprocess.run(
            ["git", "checkout", TS_FILE],
            cwd=str(PROJECT_ROOT),
            capture_output=True,
        )
        log_iteration(
            iteration, old_count, new_count, f"REVERTED — regression {old_count}→{new_count}"
        )
        return False

    improvement = old_count - new_count
    print(f"  {old_count} → {new_count} ({improvement} fixed)")

    log_iteration(iteration, old_count, new_count)
    return new_count == 0


def main():
    parser = argparse.ArgumentParser(description="Parity loop for TS bbox port")
    parser.add_argument(
        "--max-iterations",
        type=int,
        default=MAX_ITERATIONS,
        help=f"Maximum iterations (default: {MAX_ITERATIONS})",
    )
    parser.add_argument(
        "--model",
        default=CLAUDE_MODEL,
        choices=["opus", "sonnet", "haiku"],
        help=f"Claude model (default: {CLAUDE_MODEL})",
    )
    args = parser.parse_args()

    set_model(args.model)

    print(f"Parity loop: max {args.max_iterations} iterations, model: {args.model}")
    print(f"TS file: {TS_FILE}")
    print(f"PY file: {PY_FILE}")

    for iteration in range(1, args.max_iterations + 1):
        achieved = run_iteration(iteration)
        if achieved:
            print(f"\n{'='*60}")
            print(f"PARITY ACHIEVED in {iteration} iterations!")
            print(f"{'='*60}")
            return 0

    print(f"\nMax iterations ({args.max_iterations}) reached without full parity.")
    return 1


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""
Self-improving loop for geometric title extraction via OCR bounding boxes.

Each iteration:
1. Runs the evaluation pipeline (analyze_bboxes.py) on all images
2. Collects failure examples with visualizations
3. Sends failures + history to Claude Code headless to analyze and fix
4. Commits changes and logs the iteration

Persistent state in tools/title-loop/docs/bbox-loop/:
  - log.md: iteration history with accuracy, failures, fixes applied
  - iter-{N}/: per-iteration data (failures, claude output)

Usage: MPLBACKEND=Agg python3 tools/title-loop/bbox-loop.py
"""

import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

# --- Configuration ---
MAX_ITERATIONS = 20
ACCURACY_THRESHOLD = 0.80  # target: 80%+ on both PL and EN
CLAUDE_TIMEOUT = 1800  # 30 minutes per Claude session
CLAUDE_STALL_TIMEOUT = 180  # kill if no output for 3 minutes
CLAUDE_MODEL = "sonnet"

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
LOOP_DIR = Path(__file__).resolve().parent
BBOXES_DIR = LOOP_DIR / "bboxes"
DOCS_DIR = LOOP_DIR / "docs" / "bbox-loop"
LOG_FILE = DOCS_DIR / "log.md"
ALL_JSON = BBOXES_DIR / "_all.json"

os.environ.setdefault("MPLBACKEND", "Agg")


# --- Evaluation ---

def run_evaluation() -> dict:
    """Run analyze_bboxes.py evaluation and return results."""
    sys.path.insert(0, str(LOOP_DIR))
    # Force reimport to pick up any code changes
    for mod_name in list(sys.modules):
        if mod_name.startswith("analyze_bboxes"):
            del sys.modules[mod_name]

    from analyze_bboxes import (
        heuristic_region_clustering,
        titles_match,
        load_ground_truth,
        match_images_to_ground_truth,
    )

    all_bboxes = json.loads(ALL_JSON.read_text())
    gt = load_ground_truth()
    matches = match_images_to_ground_truth(all_bboxes, gt)

    results = {"total": len(matches), "matched": 0, "failures": [], "per_lang": {}}

    for m in matches:
        extracted = heuristic_region_clustering(
            m["observations"], y_tolerance=0.03, region_gap=0.02
        )
        expected = m["expected_title"]

        if titles_match(extracted, expected):
            results["matched"] += 1
        else:
            results["failures"].append({
                "image": m["image"],
                "expected": expected,
                "extracted": extracted or "(none)",
                "lang": m["lang"],
                "observation_count": len(m["observations"]),
            })

    results["accuracy"] = results["matched"] / results["total"] if results["total"] > 0 else 0

    # Per-language breakdown
    for lang in ["pl", "en"]:
        lang_matches = [m for m in matches if m["lang"] == lang]
        lang_hit = 0
        for m in lang_matches:
            extracted = heuristic_region_clustering(
                m["observations"], y_tolerance=0.03, region_gap=0.02
            )
            if titles_match(extracted, m["expected_title"]):
                lang_hit += 1
        results["per_lang"][lang] = {
            "total": len(lang_matches),
            "matched": lang_hit,
            "accuracy": lang_hit / len(lang_matches) if lang_matches else 0,
        }

    return results


# --- Claude Code headless ---

class ClaudeStallError(Exception):
    pass


def run_claude(prompt: str, log_path: Path | None = None) -> str:
    """Run Claude Code headless with streaming and stall detection."""
    cmd = [
        "claude", "--print", "--dangerously-skip-permissions",
        "--verbose",
        "--output-format", "stream-json",
        "--include-partial-messages",
        "--model", {
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


# --- Iteration ---

def get_last_iteration() -> int:
    """Read log.md to find the last iteration number."""
    if not LOG_FILE.exists():
        return 0
    last = 0
    for line in LOG_FILE.read_text().splitlines():
        m = re.match(r"^## Iteration (\d+)", line)
        if m:
            last = int(m.group(1))
    return last


def build_prompt(iteration: int, results: dict, history: str) -> str:
    """Build the Claude prompt for analyzing failures and fixing the code."""
    # Select up to 15 diverse failure examples
    failures = results["failures"][:15]
    failure_text = "\n".join(
        f"  - {f['image']} ({f['lang']}): expected=\"{f['expected']}\" got=\"{f['extracted']}\""
        for f in failures
    )

    accuracy = results["accuracy"]
    pl = results["per_lang"]["pl"]
    en = results["per_lang"]["en"]

    return f"""You are improving the geometric title extraction algorithm in tools/title-loop/analyze_bboxes.py.

## Current accuracy

- Overall: {accuracy:.1%} ({results['matched']}/{results['total']})
- PL: {pl['accuracy']:.1%} ({pl['matched']}/{pl['total']})
- EN: {en['accuracy']:.1%} ({en['matched']}/{en['total']})
- Target: ≥80% on both PL and EN

## Failure examples (iteration {iteration})

{failure_text}

Total failures: {len(results['failures'])}

## Previous iterations

{history if history else "(first iteration)"}

## Your task

1. Read tools/title-loop/analyze_bboxes.py — focus on cluster_into_regions, _cluster_column, score_title_region, detect_columns, and validate_title_text
2. Examine 3-5 of the failure images by reading their bbox JSON files from tools/title-loop/bboxes/{{IMAGE_STEM}}.json
3. Identify the dominant failure pattern — what's going wrong for most failures?
4. Make a SINGLE targeted fix to the clustering or scoring code. Don't change multiple things at once.
5. After fixing, verify by running:
   python3 -c "
   import json, sys; sys.path.insert(0, 'tools/title-loop')
   from analyze_bboxes import heuristic_region_clustering, titles_match, load_ground_truth, match_images_to_ground_truth
   all_bboxes = json.load(open('tools/title-loop/bboxes/_all.json'))
   gt = load_ground_truth()
   matches = match_images_to_ground_truth(all_bboxes, gt)
   matched = sum(1 for m in matches if titles_match(heuristic_region_clustering(m['observations'], 0.03, 0.02), m['expected_title']))
   print(f'{{matched}}/{{len(matches)}} = {{matched/len(matches):.1%}}')
   for lang in ['pl', 'en']:
       lm = [m for m in matches if m['lang'] == lang]
       hit = sum(1 for m in lm if titles_match(heuristic_region_clustering(m['observations'], 0.03, 0.02), m['expected_title']))
       print(f'  {{lang}}: {{hit}}/{{len(lm)}} = {{hit/len(lm):.1%}}')
   "

## Rules

- Only modify tools/title-loop/analyze_bboxes.py
- Make ONE fix per iteration, not multiple
- If accuracy decreased, revert and try a different approach
- Commit with a descriptive message
- Print a one-line summary of what you changed and why

## Important context

- Bounding boxes are portrait-normalized (EXIF rotation applied before OCR)
- y=0 is top of page, y=1 is bottom
- height = line height (font size proxy)
- width = horizontal text span
- The clustering groups observations into regions, then scores regions for "title-likeness"
- Common failure modes: multi-line titles split into separate regions, metadata merged with title, wrong region picked
"""


def run_iteration(iteration: int):
    """Run one iteration of the improvement loop."""
    iter_dir = DOCS_DIR / f"iter-{iteration}"
    iter_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"ITERATION {iteration}")
    print(f"{'='*60}")

    # Step 1: Evaluate
    print("\n--- Step 1: Evaluating ---")
    results = run_evaluation()
    accuracy = results["accuracy"]
    pl_acc = results["per_lang"]["pl"]["accuracy"]
    en_acc = results["per_lang"]["en"]["accuracy"]
    print(f"  Overall: {accuracy:.1%}, PL: {pl_acc:.1%}, EN: {en_acc:.1%}")
    print(f"  Failures: {len(results['failures'])}")

    # Save results
    (iter_dir / "results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False))

    # Check if we've reached the target
    if pl_acc >= ACCURACY_THRESHOLD and en_acc >= ACCURACY_THRESHOLD:
        print(f"\n  TARGET REACHED! PL: {pl_acc:.1%}, EN: {en_acc:.1%}")
        log_iteration(iteration, results, "TARGET REACHED", "")
        return True

    # Step 2: Build prompt with history
    history = LOG_FILE.read_text() if LOG_FILE.exists() else ""
    prompt = build_prompt(iteration, results, history)

    # Step 3: Run Claude
    print("\n--- Step 2: Running Claude ---")
    try:
        claude_output = run_claude(prompt, log_path=iter_dir / "claude_output.txt")
    except (ClaudeStallError, RuntimeError) as e:
        print(f"  Claude failed: {e}")
        log_iteration(iteration, results, f"CLAUDE FAILED: {e}", "")
        return False

    (iter_dir / "claude_response.md").write_text(claude_output)

    # Step 3: Re-evaluate after fix
    print("\n--- Step 3: Re-evaluating ---")
    new_results = run_evaluation()
    new_accuracy = new_results["accuracy"]
    new_pl = new_results["per_lang"]["pl"]["accuracy"]
    new_en = new_results["per_lang"]["en"]["accuracy"]
    print(f"  New: Overall: {new_accuracy:.1%}, PL: {new_pl:.1%}, EN: {new_en:.1%}")

    delta = new_accuracy - accuracy
    summary = claude_output.strip().split("\n")[-1] if claude_output.strip() else "(no output)"

    log_iteration(iteration, new_results, summary, f"delta={delta:+.1%}")

    return False


def log_iteration(iteration: int, results: dict, summary: str, notes: str):
    """Append iteration results to the persistent log."""
    DOCS_DIR.mkdir(parents=True, exist_ok=True)

    accuracy = results["accuracy"]
    pl = results["per_lang"]["pl"]
    en = results["per_lang"]["en"]

    entry = f"""## Iteration {iteration}

- Overall: {accuracy:.1%} ({results['matched']}/{results['total']})
- PL: {pl['accuracy']:.1%} ({pl['matched']}/{pl['total']})
- EN: {en['accuracy']:.1%} ({en['matched']}/{en['total']})
- Fix: {summary}
- {notes}

"""

    if LOG_FILE.exists():
        LOG_FILE.write_text(LOG_FILE.read_text() + entry)
    else:
        LOG_FILE.write_text(f"# Bbox Loop — Iteration Log\n\n{entry}")


def main():
    if not ALL_JSON.exists():
        print(f"Error: {ALL_JSON} not found. Run recognize_bboxes.py first.")
        sys.exit(1)

    start_iter = get_last_iteration() + 1
    print(f"Starting from iteration {start_iter} (max {MAX_ITERATIONS})")

    for iteration in range(start_iter, start_iter + MAX_ITERATIONS):
        done = run_iteration(iteration)
        if done:
            print(f"\nTarget accuracy reached at iteration {iteration}!")
            break
    else:
        print(f"\nMax iterations ({MAX_ITERATIONS}) reached.")

    print("\nDone. See log at:", LOG_FILE)


if __name__ == "__main__":
    main()

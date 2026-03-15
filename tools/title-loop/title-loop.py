#!/usr/bin/env python3
"""
Self-improving title extraction loop.

Iteratively evaluates and improves the title extraction algorithm by:
1. Running extraction against real and generated OCR input files
2. Using Claude Code headless for analysis, planning, and implementation
3. Committing improvements and tracking accuracy across iterations

Fully resumable: detects which step of an iteration was last completed
and picks up from there.

Usage: python3 tools/title-loop/title-loop.py
"""

import glob
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
ACCURACY_THRESHOLD = 0.95  # "close to 100%"
SYNTHETIC_COUNT = 100
CLAUDE_TIMEOUT = 900  # 15 minutes per Claude invocation
CLAUDE_STALL_TIMEOUT = 60  # kill if no output for N seconds (default)
CLAUDE_STALL_TIMEOUT_BY_MODEL = {"opus": 180, "sonnet": 120, "haiku": 60}
CLAUDE_MAX_RETRIES = 3  # max retries per stage on stall/failure
EXTRACT_TIMEOUT = 120  # 2 minutes per file extraction

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
LOOP_DIR = Path(__file__).resolve().parent
INPUT_DIR = LOOP_DIR / "input"
DOCS_DIR = LOOP_DIR / "docs"
EXTRACT_SCRIPT = LOOP_DIR / "extract-title.ts"
ITER_LOG = DOCS_DIR / "iter.txt"

# Number of recent output lines to show in live display


# --- Resume state detection ---

def find_iter_dir(iteration: int) -> Path | None:
    """Find the iteration directory for a given iteration number (hash may vary)."""
    matches = sorted(DOCS_DIR.glob(f"{iteration}-*"))
    matches = [m for m in matches if re.match(rf"^{iteration}-[a-f0-9]+$", m.name)]
    return matches[0] if matches else None


def get_logged_accuracy(iteration: int) -> float | None:
    """Read the accuracy logged for a specific iteration from iter.txt."""
    if not ITER_LOG.exists():
        return None
    for line in ITER_LOG.read_text().strip().splitlines():
        m = re.match(r"^(\d+)\s*-\s*([\d.]+)%", line)
        if m and int(m.group(1)) == iteration:
            return float(m.group(2)) / 100
    return None


def get_last_logged_iteration() -> int:
    """Read iter.txt to find the last logged iteration number. Returns 0 if none."""
    if not ITER_LOG.exists():
        return 0
    last = 0
    for line in ITER_LOG.read_text().strip().splitlines():
        m = re.match(r"^(\d+)\s*-\s*", line)
        if m:
            last = int(m.group(1))
    return last


def determine_resume_phase(iteration: int) -> str:
    """
    Determine what phase to resume from for a given iteration.

    Returns one of:
      'evaluate'  — no results yet, start from scratch
      'analyze'   — results exist but no feedback.md
      'plan'      — feedback exists but no improvement-plan.md
      'execute'   — plan exists but not yet implemented/committed
      'done'      — accuracy met threshold, iteration complete
    """
    iter_dir = find_iter_dir(iteration)
    if iter_dir is None or not (iter_dir / "results.txt").exists():
        return "evaluate"

    accuracy = get_logged_accuracy(iteration)
    if accuracy is not None and accuracy >= ACCURACY_THRESHOLD:
        return "done"

    if not (iter_dir / "feedback.md").exists():
        return "analyze"

    if not (iter_dir / "improvement-plan.md").exists():
        return "plan"

    if (iter_dir / "committed").exists():
        return "done"

    return "execute"


# --- Core helpers ---

def normalize(s: str) -> str:
    """Normalize whitespace and case for comparison."""
    return " ".join(s.lower().split())


def normalize_separators(s: str) -> str:
    """Normalize filesystem-substituted characters (: replaces / in filenames)."""
    return s.replace(":", "/")


def titles_match(extracted: str, expected: str) -> bool:
    """
    Binary match: does the extracted title contain all expected title parts?
    Expected may contain multiple titles separated by '+'.
    """
    if not extracted:
        return False
    extracted_norm = normalize_separators(normalize(extracted))
    expected_parts = [normalize_separators(normalize(p)) for p in expected.split("+")]
    return all(part in extracted_norm for part in expected_parts)


def extract_expected_title(filename: str) -> str:
    """Extract expected title from filename like 'Tomato Soup.real.txt'."""
    name = Path(filename).name
    cleaned = re.sub(r"\.(real|generated\.\d+)\.txt$", "", name)
    if cleaned == name:
        raise ValueError(f"Unrecognized filename format: {filename!r}")
    return cleaned


def run_extraction(file_path: str) -> str:
    """Run the title extraction CLI on a file and return the extracted title."""
    try:
        result = subprocess.run(
            ["npx", "tsx", str(EXTRACT_SCRIPT), file_path],
            capture_output=True,
            text=True,
            timeout=EXTRACT_TIMEOUT,
            cwd=str(PROJECT_ROOT),
        )
        if result.returncode != 0:
            print(f"  WARNING: extraction failed for {file_path}: {result.stderr.strip()}")
            return ""
        return result.stdout.strip()
    except subprocess.TimeoutExpired:
        print(f"  WARNING: extraction timed out for {file_path}")
        return ""


def evaluate_files(file_paths: list[str]) -> list[dict]:
    """Evaluate extraction on a list of files. Returns list of result dicts."""
    results = []
    for fp in file_paths:
        expected = extract_expected_title(fp)
        extracted = run_extraction(fp)
        match = titles_match(extracted, expected)
        results.append({
            "file": fp,
            "expected": expected,
            "extracted": extracted,
            "match": match,
        })
        status = "YES" if match else "NO"
        print(f"  {status}: expected='{expected}' got='{extracted}'")
    return results


def compute_accuracy(results: list[dict]) -> float:
    """Compute accuracy as fraction of matches."""
    if not results:
        return 0.0
    return sum(1 for r in results if r["match"]) / len(results)


def write_results(iter_dir: Path, results: list[dict]) -> None:
    """Write results.txt with one line per file."""
    iter_dir.mkdir(parents=True, exist_ok=True)
    with open(iter_dir / "results.txt", "w") as f:
        for r in results:
            status = "yes" if r["match"] else "no"
            f.write(f"{r['expected']} - {status}\n")


def load_results_from_file(iter_dir: Path) -> list[dict]:
    """Reconstruct minimal results from results.txt for building failure prompts."""
    results = []
    results_path = iter_dir / "results.txt"
    if not results_path.exists():
        return results
    for line in results_path.read_text().strip().splitlines():
        m = re.match(r"^(.+) - (yes|no)$", line)
        if m:
            expected = m.group(1)
            match = m.group(2) == "yes"
            real_file = INPUT_DIR / f"{expected}.real.txt"
            file_path = str(real_file) if real_file.exists() else f"(input file for '{expected}')"
            results.append({
                "file": file_path,
                "expected": expected,
                "extracted": "(from previous evaluation)",
                "match": match,
            })
    return results


def get_commit_hash() -> str:
    """Get current git commit hash (short)."""
    result = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        capture_output=True,
        text=True,
        cwd=str(PROJECT_ROOT),
    )
    return result.stdout.strip()


def git_commit_all(message: str) -> str:
    """Stage source changes and iteration docs. Returns new commit hash."""
    subprocess.run(
        ["git", "add",
         "lib/text-classifier/",
         "tools/title-loop/docs/",
         "tools/title-loop/extract-title.ts",
         "tools/title-loop/title-loop.py"],
        cwd=str(PROJECT_ROOT),
        check=True,
    )
    # Temporarily disable Entire hooks to avoid interactive /dev/tty prompts
    subprocess.run(["entire", "disable"], cwd=str(PROJECT_ROOT),
                   capture_output=True)
    try:
        subprocess.run(
            ["git", "commit", "-m", message],
            cwd=str(PROJECT_ROOT),
            check=True,
        )
        return get_commit_hash()
    finally:
        subprocess.run(["entire", "enable", "--agent", "claude-code"],
                       cwd=str(PROJECT_ROOT), capture_output=True)


# --- Claude invocation with live display ---

def _clear_display(height: int) -> None:
    """Move cursor up and clear lines to overwrite previous display."""
    if height > 0:
        sys.stdout.write(f"\033[{height}A")
        for _ in range(height):
            sys.stdout.write("\033[2K\n")
        sys.stdout.write(f"\033[{height}A")


def _render_display(model: str, elapsed: float,
                    input_tokens: int = 0, output_tokens: int = 0) -> int:
    """Render the live display line. Returns number of lines written."""
    term_width = shutil.get_terminal_size().columns

    header = f"  Running Claude ({model})..."
    stats = f"\u2191 {input_tokens:,} | \u2193 {output_tokens:,} | {elapsed:.0f}s"
    padding = max(1, term_width - len(header) - len(stats))
    sys.stdout.write(f"{header}{' ' * padding}{stats}\n")

    sys.stdout.flush()
    return 1


class ClaudeStallError(RuntimeError):
    """Raised when Claude produces no output for CLAUDE_STALL_TIMEOUT seconds."""
    pass


def _run_claude_once(
    prompt: str,
    model: str = "sonnet",
    log_path: Path | None = None,
) -> str:
    """
    Run Claude Code in headless mode with live streaming display (single attempt).

    Uses --output-format stream-json with --include-partial-messages to get
    real-time text deltas. Shows elapsed time and the last 5 lines of output.
    Saves full output to log_path if provided.

    Raises ClaudeStallError if no output received for CLAUDE_STALL_TIMEOUT seconds.
    Raises RuntimeError on non-zero exit or overall timeout.
    """
    cmd = [
        "claude", "--print", "--dangerously-skip-permissions",
        "--verbose",
        "--output-format", "stream-json",
        "--include-partial-messages",
    ]

    model_ids = {
        "opus": "claude-opus-4-6",
        "sonnet": "claude-sonnet-4-6",
        "haiku": "claude-haiku-4-5-20251001",
    }
    cmd.extend(["--model", model_ids.get(model, model_ids["sonnet"])])

    start = time.time()
    raw_lines: list[str] = []  # raw NDJSON lines for logging
    result_text = ""  # final result extracted from stream
    input_tokens = 0  # running count from message_start usage
    output_tokens = 0  # running count from message_delta usage
    last_activity = time.time()  # tracks last time model produced any output
    display_height = 0
    reader_done = threading.Event()
    lock = threading.Lock()

    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=str(PROJECT_ROOT),
    )

    # Send prompt and close stdin
    try:
        proc.stdin.write(prompt)
        proc.stdin.close()
    except BrokenPipeError:
        pass

    # Read and parse stream-json stdout in background
    def reader():
        nonlocal result_text, input_tokens, output_tokens, last_activity
        try:
            for line in proc.stdout:
                raw_lines.append(line)
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    event = json.loads(stripped)
                except json.JSONDecodeError:
                    continue

                etype = event.get("type", "")

                if etype == "stream_event":
                    nested = event.get("event", {})
                    ntype = nested.get("type", "")
                    # Any content_block_delta (thinking, text, tool JSON) = model is active
                    if ntype == "content_block_delta":
                        with lock:
                            last_activity = time.time()
                    # Track input tokens from message_start
                    elif ntype == "message_start":
                        usage = nested.get("message", {}).get("usage", {})
                        added = (usage.get("input_tokens", 0)
                                 + usage.get("cache_creation_input_tokens", 0)
                                 + usage.get("cache_read_input_tokens", 0))
                        if added:
                            with lock:
                                input_tokens += added
                                last_activity = time.time()
                    # Track output tokens from message_delta
                    elif ntype == "message_delta":
                        usage = nested.get("usage", {})
                        tok = usage.get("output_tokens", 0)
                        if tok:
                            with lock:
                                output_tokens += tok
                                last_activity = time.time()

                # Final result
                elif etype == "result":
                    result_text = event.get("result", "")
        finally:
            reader_done.set()

    thread = threading.Thread(target=reader, daemon=True)
    thread.start()

    # Live display loop
    stall_timeout = CLAUDE_STALL_TIMEOUT_BY_MODEL.get(model, CLAUDE_STALL_TIMEOUT)
    stalled = False
    try:
        while not reader_done.is_set():
            elapsed = time.time() - start

            # Overall timeout check
            if elapsed > CLAUDE_TIMEOUT:
                proc.kill()
                break

            # Stall detection: no token traffic for stall_timeout seconds
            with lock:
                silence = time.time() - last_activity
            if silence > stall_timeout:
                stalled = True
                proc.kill()
                break

            _clear_display(display_height)
            display_height = _render_display(model, elapsed, input_tokens, output_tokens)

            reader_done.wait(timeout=1.0)

        # Final display update
        elapsed = time.time() - start
        _clear_display(display_height)
        display_height = _render_display(model, elapsed, input_tokens, output_tokens)

    except KeyboardInterrupt:
        proc.kill()
        _clear_display(display_height)
        print(f"  Claude ({model}) interrupted by user")
        raise

    # Wait for process to finish
    try:
        proc.wait(timeout=30)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()

    stderr_output = proc.stderr.read()
    elapsed = time.time() - start

    # Use result from stream; fall back to joining raw output
    full_output = result_text or "".join(raw_lines)

    # Save log (always, even on failure)
    if log_path:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(log_path, "w") as f:
            f.write(f"# Claude ({model}) — {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"# Duration: {elapsed:.0f}s — Exit: {proc.returncode}\n")
            f.write(f"# Prompt:\n")
            for pline in prompt.splitlines():
                f.write(f"#   {pline}\n")
            f.write(f"\n{'=' * 60}\n\n")
            f.write(result_text or "")
            if stderr_output:
                f.write(f"\n{'=' * 60}\n# STDERR:\n{stderr_output}\n")
            # Also save raw NDJSON stream for debugging
            f.write(f"\n{'=' * 60}\n# RAW STREAM ({len(raw_lines)} events):\n")
            for rl in raw_lines:
                f.write(rl)

    # Status line and error handling
    if stalled:
        msg = f"Claude ({model}) stalled (no output for {stall_timeout}s) at {elapsed:.0f}s"
        print(f"\n  {msg}")
        raise ClaudeStallError(msg)
    elif proc.returncode == 0:
        print(f"\n  Claude ({model}) finished in {elapsed:.0f}s")
    elif elapsed > CLAUDE_TIMEOUT:
        print(f"\n  Claude ({model}) timed out after {elapsed:.0f}s")
        raise RuntimeError(f"Claude ({model}) timed out after {elapsed:.0f}s")
    else:
        msg = f"Claude ({model}) failed (exit {proc.returncode}) in {elapsed:.0f}s"
        print(f"\n  {msg}")
        if stderr_output:
            print(f"  stderr: {stderr_output[:500]}")
        raise RuntimeError(f"{msg}\n{stderr_output[:1000]}")

    return result_text or full_output


def run_claude(
    prompt: str,
    model: str = "sonnet",
    log_path: Path | None = None,
) -> str:
    """
    Run Claude Code with automatic retry on stalls.

    Retries up to CLAUDE_MAX_RETRIES times when Claude stalls (no output for
    CLAUDE_STALL_TIMEOUT seconds). After exhausting retries, raises RuntimeError.
    Non-stall failures (exit code, overall timeout) are raised immediately.
    """
    for attempt in range(1, CLAUDE_MAX_RETRIES + 1):
        try:
            return _run_claude_once(prompt, model=model, log_path=log_path)
        except ClaudeStallError:
            if attempt < CLAUDE_MAX_RETRIES:
                print(f"  Retrying ({attempt}/{CLAUDE_MAX_RETRIES})...")
            else:
                raise RuntimeError(
                    f"Claude ({model}) stalled {CLAUDE_MAX_RETRIES} times — giving up"
                )
    # unreachable, but satisfies type checker
    raise RuntimeError("unreachable")


# --- Iteration phases ---

def check_real_accuracy() -> tuple[float, list[dict]]:
    """Evaluate real input files and return (accuracy, results)."""
    real_files = sorted(glob.glob(str(INPUT_DIR / "*.real.txt")))
    print(f"  Found {len(real_files)} real files")
    real_results = evaluate_files(real_files)
    real_accuracy = compute_accuracy(real_results)
    real_pass = sum(1 for r in real_results if r["match"])
    print(f"\n  Real accuracy: {real_accuracy:.1%} ({real_pass}/{len(real_files)})")
    return real_accuracy, real_results


def phase_evaluate(iteration: int, log_dir: Path) -> tuple[Path, float, list[dict]]:
    """Run evaluation, write results, log accuracy. Returns (iter_dir, accuracy, results).

    The returned accuracy only meets ACCURACY_THRESHOLD when BOTH the real
    examples AND the combined (real + synthetic) score are above the threshold.
    This prevents synthetic examples from masking regressions on real data.
    """
    print(f"\nEvaluating real input files...")
    real_accuracy, real_results = check_real_accuracy()

    gen_results: list[dict] = []
    combined_accuracy = real_accuracy

    # If real accuracy is high enough, test on generated data too
    if real_accuracy >= ACCURACY_THRESHOLD:
        print(f"\nGenerating {SYNTHETIC_COUNT} synthetic OCR files...")
        generate_synthetic_data(iteration, log_dir=log_dir)

        print(f"\nEvaluating generated files...")
        gen_files = sorted(glob.glob(str(INPUT_DIR / f"*.generated.{iteration}.txt")))
        print(f"  Found {len(gen_files)} generated files")
        if gen_files:
            gen_results = evaluate_files(gen_files)
            gen_accuracy = compute_accuracy(gen_results)
            print(f"\n  Generated accuracy: {gen_accuracy:.1%}")
            combined_accuracy = compute_accuracy(real_results + gen_results)
        else:
            print("  WARNING: No generated files found. Claude may have failed.")

    all_results = real_results + gen_results
    print(f"\n  Combined accuracy: {combined_accuracy:.1%}")

    # Gate: real accuracy must independently meet the threshold.
    # If combined is above target but real is below, use real accuracy as the
    # effective score so the loop continues iterating.
    effective_accuracy = min(real_accuracy, combined_accuracy)
    if combined_accuracy >= ACCURACY_THRESHOLD and real_accuracy < ACCURACY_THRESHOLD:
        print(f"  WARNING: Combined accuracy meets threshold but real accuracy "
              f"({real_accuracy:.1%}) does not — continuing iteration.")

    # Log iteration accuracy — first number is always the effective (gated) score
    # so that get_logged_accuracy / determine_resume_phase see the right value.
    with open(ITER_LOG, "a") as f:
        if gen_results:
            f.write(f"{iteration} - {effective_accuracy:.1%} (combined: {combined_accuracy:.1%}, real: {real_accuracy:.1%})\n")
        else:
            f.write(f"{iteration} - {real_accuracy:.1%}\n")

    # Create iteration directory and write results
    commit_hash = get_commit_hash()
    iter_dir = DOCS_DIR / f"{iteration}-{commit_hash}"
    write_results(iter_dir, all_results)
    print(f"  Results written to {iter_dir.relative_to(PROJECT_ROOT)}")

    return iter_dir, effective_accuracy, all_results


def generate_synthetic_data(iteration: int, log_dir: Path) -> None:
    """Generate synthetic OCR data using Claude Code."""
    real_files = glob.glob(str(INPUT_DIR / "*.real.txt"))
    existing_titles = [extract_expected_title(f) for f in real_files]
    titles_list = ", ".join(existing_titles)

    prompt = f"""Generate {SYNTHETIC_COUNT} realistic fake OCR recipe text files.

Each file should simulate real OCR output from a scanned cookbook page. Include typical
OCR artifacts: slightly misrecognized characters, broken line wraps, page numbers,
headers/footers, section labels.

Save each file to: tools/title-loop/input/{{RECIPE_TITLE}}.generated.{iteration}.txt

The recipe title in the filename must EXACTLY match the main title as it appears in the
generated text content (case-insensitive matching is fine, but the words must match).

Requirements:
- Mix of English and Polish recipes (roughly 60/40)
- Variety: soups, mains, desserts, salads, appetizers, breads, drinks, preserves
- Include multi-word titles (2-5 words), some single-word titles
- Include OCR noise: garbled short lines at top/bottom, stray numbers, broken words
- Some files should have the title after noise/headers (not first line)
- Vary title position: top, after page number, after section header, mid-page
- Some should have section headers like INGREDIENTS, SKŁADNIKI before or near the title
- Generate DIFFERENT recipes than these existing ones: {titles_list}
- Each file should be 15-40 lines long

Generate all {SYNTHETIC_COUNT} files. Work through them systematically."""

    run_claude(prompt, model="haiku", log_path=log_dir / "generate.log")


def phase_analyze(iter_dir: Path, results: list[dict]) -> None:
    """Analyze extraction failures with Claude (Sonnet)."""
    log_dir = iter_dir / "logs"
    failures = [r for r in results if not r["match"]]
    if not failures:
        (iter_dir / "feedback.md").write_text("No failures to analyze — all extractions matched.\n")
        return

    failure_details = "\n".join(
        f"- File: {r['file']}\n  Expected: '{r['expected']}'\n  Got: '{r['extracted']}'"
        for r in failures
    )

    prompt = f"""Analyze the title extraction failures below. Read each failing input file
and the current implementation at lib/text-classifier/title-extractor.ts.

Write your analysis to {iter_dir.relative_to(PROJECT_ROOT)}/feedback.md explaining:
1. What patterns the algorithm fails on
2. Why each specific failure occurred
3. Common themes across failures

Do NOT modify any code files. Only write the feedback.md file.

Failures:
{failure_details}

Results file: {iter_dir.relative_to(PROJECT_ROOT)}/results.txt"""

    run_claude(prompt, model="sonnet", log_path=log_dir / "analyze.log")


def phase_plan(iter_dir: Path, iteration: int) -> None:
    """Plan algorithm improvements with Claude (Opus)."""
    log_dir = iter_dir / "logs"
    prompt = f"""Read the feedback at {iter_dir.relative_to(PROJECT_ROOT)}/feedback.md
and the current title extraction implementation at lib/text-classifier/title-extractor.ts.
Also read previous iteration docs in tools/title-loop/docs/ to understand what has been tried.

Your job: propose changes that fix every failure. Think creatively and ambitiously.

Hard constraints:
- Must run on a mobile device (React Native / Expo)
- Total title extraction must complete under 10 seconds
- Changes land in lib/text-classifier/ and related files

Everything else is open for debate. The current approach (MiniLM embeddings + heuristic scoring)
is one option, but you are free to propose alternatives if they'd work better:
- Different embedding model or similarity strategy
- Replacing embeddings entirely with a rule-based or hybrid approach
- Restructuring the pipeline (e.g., two-pass, re-ranking, candidate merging)
- Changing how candidates are generated, filtered, or deduplicated
- Any other approach that solves the failures within the hard constraints

Don't be incremental for the sake of it — if the feedback reveals a fundamental design flaw,
propose a fundamental fix. But also don't change things that already work well.

Before writing any files, briefly outline your key proposed changes (2-3 sentences per failure)
so you can think through the approach first.

Then write a detailed improvement plan to {iter_dir.relative_to(PROJECT_ROOT)}/improvement-plan.md
that includes:
1. Root cause analysis for each failure pattern
2. Specific code changes with before/after examples
3. New or modified heuristics, scoring adjustments, or pipeline changes
4. Expected impact on accuracy

Do NOT modify any code files. Only write the improvement-plan.md file."""

    run_claude(prompt, model="opus", log_path=log_dir / "plan.log")


def phase_execute(iter_dir: Path) -> None:
    """Execute improvements with Claude (Sonnet), verify, and commit."""
    log_dir = iter_dir / "logs"
    prompt = f"""Execute the improvement plan at {iter_dir.relative_to(PROJECT_ROOT)}/improvement-plan.md.

Modify lib/text-classifier/title-extractor.ts and any related files as needed.
Make sure:
1. All existing tests still pass
2. The CLI at tools/title-loop/extract-title.ts still works
3. The code is clean and follows the project conventions in AGENTS.md
4. No unnecessary changes outside the title extraction logic

CRITICAL CONSTRAINT: Do NOT modify the substring deduplication logic in title-extractor.ts.
The block starting with "// Deduplicate: if one title is a substring of another, keep the shorter"
must remain exactly as-is. It keeps the SHORTER candidate. Do not invert this to keep the longer.
This has been incorrectly changed 5 times and breaks tests every time.

After making changes, run: npx vitest run --globals lib/text-classifier/__tests__/title-extractor.test.ts
Fix any test failures before finishing."""

    run_claude(prompt, model="sonnet", log_path=log_dir / "execute.log")

    # Verify tests and CLI
    print(f"\nVerifying tests and CLI...")
    tests_ok = run_tests()
    cli_ok = verify_cli()

    if not tests_ok or not cli_ok:
        print("  WARNING: Verification failed. Attempting to fix...")
        fix_prompt = """The title extraction tests or CLI are failing after recent changes.
Please fix any issues in lib/text-classifier/title-extractor.ts.
Run: npx vitest run lib/text-classifier/__tests__/title-extractor.test.ts
And verify: npx tsx tools/title-loop/extract-title.ts tools/title-loop/input/*.real.txt
Make sure both pass before finishing."""
        run_claude(fix_prompt, model="sonnet", log_path=log_dir / "fix.log")

        if not run_tests() or not verify_cli():
            raise RuntimeError("Tests or CLI still failing after fix attempt")


def run_tests() -> bool:
    """Run the title extraction tests."""
    print("  Running tests...")
    result = subprocess.run(
        ["npx", "vitest", "run", "--globals", "lib/text-classifier/__tests__/title-extractor.test.ts"],
        capture_output=True,
        text=True,
        timeout=120,
        cwd=str(PROJECT_ROOT),
    )
    if result.returncode != 0:
        print(f"  Tests FAILED: {result.stdout[-500:]}")
        return False
    print("  Tests passed.")
    return True


def verify_cli() -> bool:
    """Verify the CLI script runs without errors on a sample file."""
    real_files = glob.glob(str(INPUT_DIR / "*.real.txt"))
    if not real_files:
        print("  No real files to test CLI with")
        return False

    sample = real_files[0]
    print(f"  Verifying CLI on: {Path(sample).name}")
    result = subprocess.run(
        ["npx", "tsx", str(EXTRACT_SCRIPT), sample],
        capture_output=True,
        text=True,
        timeout=EXTRACT_TIMEOUT,
        cwd=str(PROJECT_ROOT),
    )
    if result.returncode != 0:
        print(f"  CLI verification FAILED: {result.stderr[:300]}")
        return False
    print(f"  CLI output: '{result.stdout.strip()}'")
    return True


# --- Main loop ---

def main() -> None:
    """Main self-improving loop with full mid-iteration resumability."""
    DOCS_DIR.mkdir(parents=True, exist_ok=True)

    last_logged = get_last_logged_iteration()
    if last_logged > 0:
        last_phase = determine_resume_phase(last_logged)
        if last_phase == "done":
            accuracy = get_logged_accuracy(last_logged)
            if accuracy is not None and accuracy >= ACCURACY_THRESHOLD:
                # Re-check real examples before declaring victory — code may
                # have changed since the logged accuracy was recorded.
                print(f"Iteration {last_logged} logged {accuracy:.1%}. Re-checking real examples...")
                real_accuracy, _ = check_real_accuracy()
                if real_accuracy >= ACCURACY_THRESHOLD:
                    print(f"  Real examples still passing. Nothing to do.")
                    return
                print(f"  Real accuracy regressed — continuing with new iteration.")
            start_iteration = last_logged + 1
        else:
            start_iteration = last_logged
    else:
        start_iteration = 1

    print("=" * 60)
    print("SELF-IMPROVING TITLE EXTRACTION LOOP")
    print(f"Max iterations: {MAX_ITERATIONS}")
    print(f"Accuracy threshold: {ACCURACY_THRESHOLD:.0%}")
    print(f"Input dir: {INPUT_DIR}")
    if start_iteration > 1:
        phase = determine_resume_phase(start_iteration)
        print(f"Resuming: iteration {start_iteration}, phase '{phase}'")
    print("=" * 60)
    print()

    # Verify CLI works before starting
    print("Pre-flight: verifying CLI...")
    if not verify_cli():
        print("FATAL: CLI verification failed. Fix before running the loop.")
        sys.exit(1)
    print()

    for iteration in range(start_iteration, MAX_ITERATIONS + 1):
        phase = determine_resume_phase(iteration)

        if phase == "done":
            print(f"Iteration {iteration} already completed. Skipping.")
            continue

        print("=" * 60)
        print(f"ITERATION {iteration}" + (f"  (resuming from '{phase}')" if phase != "evaluate" else ""))
        print("=" * 60)

        iter_dir = find_iter_dir(iteration)
        all_results: list[dict] | None = None

        # Ensure logs dir exists for this iteration
        if iter_dir:
            (iter_dir / "logs").mkdir(parents=True, exist_ok=True)

        # --- EVALUATE ---
        if phase == "evaluate":
            # Create provisional log dir (iter_dir doesn't exist yet)
            commit_hash = get_commit_hash()
            provisional_log_dir = DOCS_DIR / f"{iteration}-{commit_hash}" / "logs"
            provisional_log_dir.mkdir(parents=True, exist_ok=True)

            try:
                iter_dir, combined_accuracy, all_results = phase_evaluate(iteration, log_dir=provisional_log_dir)
            except RuntimeError as e:
                print(f"  FATAL: {e}. Stopping.")
                break

            if combined_accuracy >= ACCURACY_THRESHOLD:
                print(f"\n{'=' * 60}")
                print(f"TARGET ACCURACY REACHED: {combined_accuracy:.1%}")
                print(f"Stopping after iteration {iteration}")
                print(f"{'=' * 60}")
                break

        assert iter_dir is not None, f"No iteration directory found for iteration {iteration}"

        # --- ANALYZE ---
        if phase in ("evaluate", "analyze"):
            print(f"\nAnalyzing failures with Claude (Sonnet)...")
            if all_results is None:
                all_results = load_results_from_file(iter_dir)
            try:
                phase_analyze(iter_dir, all_results)
            except RuntimeError as e:
                print(f"  FATAL: {e}. Stopping.")
                break

        # --- PLAN ---
        if phase in ("evaluate", "analyze", "plan"):
            print(f"\nPlanning improvements with Claude (Opus)...")
            try:
                phase_plan(iter_dir, iteration)
            except RuntimeError as e:
                print(f"  FATAL: {e}. Stopping.")
                break

        # --- EXECUTE + VERIFY + COMMIT ---
        print(f"\nExecuting improvements with Claude (Sonnet)...")
        try:
            phase_execute(iter_dir)
        except RuntimeError as e:
            print(f"  FATAL: {e}. Stopping.")
            break

        # Commit changes
        print(f"\nCommitting changes...")
        try:
            commit_hash = git_commit_all(f"title-extraction: iteration {iteration}")
            print(f"  Committed: {commit_hash}")
        except subprocess.CalledProcessError as e:
            # git commit exits 1 both for "nothing to commit" and real failures.
            # Check git status to distinguish.
            status = subprocess.run(
                ["git", "status", "--porcelain"],
                capture_output=True, text=True, cwd=str(PROJECT_ROOT),
            )
            if not status.stdout.strip():
                print("  WARNING: Nothing to commit (no changes made)")
                commit_hash = get_commit_hash()
            else:
                print(f"  FATAL: git commit failed: {e}. Stopping.")
                break

        # Mark iteration as committed so resume skips it
        (iter_dir / "committed").write_text(f"{commit_hash}\n")

        # Prepare next iteration directory
        next_dir = DOCS_DIR / f"{iteration + 1}-{commit_hash}"
        next_dir.mkdir(parents=True, exist_ok=True)

        print(f"\n  Next iteration dir: {next_dir.relative_to(PROJECT_ROOT)}")
        print()

    else:
        print(f"\n{'=' * 60}")
        print(f"MAX ITERATIONS ({MAX_ITERATIONS}) REACHED")
        print(f"Final accuracy may not have met threshold.")
        print(f"{'=' * 60}")

    # Print summary
    print(f"\nIteration log:")
    if ITER_LOG.exists():
        print(ITER_LOG.read_text())


if __name__ == "__main__":
    main()

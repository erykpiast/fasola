#!/usr/bin/env python3
"""Expand Simple Task Master tasks with detailed implementation plans via Claude Code."""

import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

TASKS_DIR = Path(".simple-task-master/tasks")
LOG_DIR = Path(".simple-task-master/logs")
MAX_PARALLEL = 3


def expand_task(task_file: Path) -> str:
    """Process a single task file. Returns a status message."""
    name = task_file.name
    original = task_file.read_text()

    # Skip tasks that aren't pending
    if not re.search(r"^status: pending$", original, re.MULTILINE):
        return f"[SKIP]  {name} (not pending)"

    print(f"[START] {name}", flush=True)

    # Strip any existing ## Implementation Plan section (idempotency)
    stripped = re.split(r"\n## Implementation Plan\n", original, maxsplit=1)[0].rstrip()

    prompt = f"""\
You are analyzing a task for a React Native/Expo recipe photo management app called Fasola.

Read the following task file and then explore the codebase to understand the issue deeply.

<task-file path="{task_file}">
{original}
</task-file>

Your job:
1. Read the task file above to understand the issue
2. Explore the codebase to find all relevant files, components, and patterns related to this task
3. Think about what the issue means specifically in this codebase
4. Plan a concrete solution

Output ONLY the implementation plan as markdown. No frontmatter, no preamble, no "Here is the plan" intro. Start directly with the content. Structure it with:
- **Relevant Files**: List the key files involved with brief notes
- **Analysis**: What's happening now and what needs to change
- **Steps**: Numbered implementation steps with specific code-level details
- **Testing**: How to verify the fix works"""

    cmd = [
        "claude",
        "-p",
        "--dangerously-skip-permissions",
        "--allowedTools", "Read,Grep,Glob,Bash(ls:*),Bash(find:*),Agent",
    ]

    model = os.environ.get("CLAUDE_MODEL")
    if model:
        cmd.extend(["--model", model])

    try:
        result = subprocess.run(cmd, input=prompt, capture_output=True, text=True, check=True)
        plan_output = result.stdout.strip()
    except subprocess.CalledProcessError as e:
        log_file = LOG_DIR / f"{task_file.stem}.error.log"
        log_file.write_text(
            f"=== {datetime.now().isoformat()} ===\n"
            f"Exit code: {e.returncode}\n\n"
            f"--- stdout ---\n{e.stdout or '(empty)'}\n\n"
            f"--- stderr ---\n{e.stderr or '(empty)'}\n"
        )
        return f"[ERROR] {name} - Claude session failed (see {log_file})"

    # Update status from pending to planned
    updated = re.sub(r"^status: pending$", "status: planned", stripped, count=1, flags=re.MULTILINE)

    # Write back: preserved original (status updated) + implementation plan
    task_file.write_text(f"{updated}\n\n## Implementation Plan\n\n{plan_output}\n")

    return f"[DONE]  {name}"


def main():
    task_files = sorted(TASKS_DIR.glob("*.md"))

    if not task_files:
        print("No task files found in", TASKS_DIR)
        sys.exit(1)

    LOG_DIR.mkdir(parents=True, exist_ok=True)

    pending = [f for f in task_files if re.search(r"^status: pending$", f.read_text(), re.MULTILINE)]
    print(f"Found {len(task_files)} tasks, {len(pending)} pending (max {MAX_PARALLEL} parallel)...")
    print()

    if not pending:
        print("Nothing to do.")
        return

    with ThreadPoolExecutor(max_workers=MAX_PARALLEL) as pool:
        futures = {pool.submit(expand_task, f): f for f in pending}
        for future in as_completed(futures):
            print(future.result(), flush=True)

    print()
    print("All tasks expanded.")


if __name__ == "__main__":
    main()

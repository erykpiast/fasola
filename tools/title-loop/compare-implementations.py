#!/usr/bin/env python3
"""
Compare Python and TypeScript bbox title extraction on all test images.

Runs both implementations on each image from bboxes/_all.json,
compares extracted title strings, and outputs a failures report.

Uses batch mode for TypeScript (single process for all images) for speed.

Output: tools/title-loop/bboxes/_parity_failures.json
"""
import json
import subprocess
import sys
import time
from pathlib import Path

LOOP_DIR = Path(__file__).resolve().parent
BBOXES_DIR = LOOP_DIR / "bboxes"
ALL_JSON = BBOXES_DIR / "_all.json"
PROJECT_ROOT = LOOP_DIR.parent.parent

sys.path.insert(0, str(LOOP_DIR))
from analyze_bboxes import heuristic_region_clustering


def run_ts_batch() -> dict[str, str]:
    """Run TypeScript extraction in batch mode, return {image: title} dict."""
    result = subprocess.run(
        ["npx", "tsx", str(LOOP_DIR / "extract-bbox-batch.ts")],
        capture_output=True,
        text=True,
        timeout=120,
        cwd=str(PROJECT_ROOT),
    )
    if result.returncode != 0:
        print(f"TypeScript batch error:\n{result.stderr}", file=sys.stderr)
        return {}
    entries = json.loads(result.stdout)
    return {e["image"]: e["title"] for e in entries}


def main():
    if not ALL_JSON.exists():
        print(f"Error: {ALL_JSON} not found. Run recognize_bboxes.py first.")
        return 1

    all_bboxes = json.loads(ALL_JSON.read_text(encoding="utf-8"))
    print(f"Comparing {len(all_bboxes)} images...")

    # Run TypeScript batch (single process, fast)
    print("  Running TypeScript batch...")
    ts_start = time.time()
    ts_results = run_ts_batch()
    print(f"  TypeScript done ({time.time() - ts_start:.1f}s)")

    if not ts_results:
        print("  ERROR: TypeScript batch returned no results")
        return 1

    # Run Python and compare
    failures = []
    total = 0
    py_start = time.time()

    for i, entry in enumerate(all_bboxes):
        image = entry["image"]
        observations = entry["observations"]
        total += 1

        # Python result
        py_title = heuristic_region_clustering(observations) or ""

        # TypeScript result (from batch)
        ts_title = ts_results.get(image, "(missing)")

        if py_title != ts_title:
            failures.append(
                {
                    "image": image,
                    "python_title": py_title,
                    "ts_title": ts_title,
                }
            )

        # Progress
        if (i + 1) % 100 == 0 or i + 1 == len(all_bboxes):
            elapsed = time.time() - py_start
            parity = total - len(failures)
            print(
                f"  [{i+1}/{len(all_bboxes)}] "
                f"parity: {parity}/{total} ({parity/total:.1%}) "
                f"divergences: {len(failures)} "
                f"({elapsed:.0f}s)"
            )

    # Summary
    parity = total - len(failures)
    total_elapsed = time.time() - ts_start
    print(f"\nParity: {parity}/{total} ({parity/total:.1%})")
    print(f"Divergences: {len(failures)}")
    print(f"Total time: {total_elapsed:.0f}s")

    if failures:
        print(f"\nFirst 20 divergences:")
        for f in failures[:20]:
            print(
                f"  {f['image']}: PY=\"{f['python_title'][:60]}\" "
                f"TS=\"{f['ts_title'][:60]}\""
            )

    # Write failures JSON
    output = BBOXES_DIR / "_parity_failures.json"
    output.write_text(json.dumps(failures, indent=2, ensure_ascii=False))
    print(f"\nFull report: {output}")

    return 0 if len(failures) == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

# Self-Improving Title Extraction Loop

**Status:** Draft
**Authors:** Claude, 2026-03-14

## Overview

Extract the title detection logic into a standalone CLI script and build a Python-based self-improving loop that iteratively improves title extraction accuracy by evaluating against real and generated OCR data, using Claude Code headless instances for analysis, planning, and implementation.

## Background / Problem Statement

The app's `extractTitleWithEmbeddings` function in `lib/text-classifier/title-extractor.ts` uses MiniLM embeddings with cosine similarity scoring to extract recipe titles from OCR text. The algorithm works but its accuracy has not been systematically evaluated against a corpus of real OCR outputs. There is no automated way to:

1. Measure extraction accuracy across a test corpus
2. Identify failure patterns
3. Iteratively improve the algorithm based on empirical results

The current title extraction pipeline:
- Builds candidate strings from OCR lines (single + 2/3-line joins)
- Applies hard filters (length, ingredient detection, number prefixes)
- Scores candidates via `titleSim - max(headerSim, noiseSim)` using MiniLM embeddings
- Selects top candidates above a dynamic threshold (`max(0.05, bestScore * 0.6)`)
- Returns up to 3 titles joined with ` + `

This spec defines a closed-loop system that autonomously evaluates and improves this algorithm.

## Goals

- Standalone CLI script (`tools/extract-title.ts`) that reads a text file and outputs the extracted title
- Python orchestration script (`tools/title-loop.py`) implementing the self-improving loop
- Evaluation framework: compare extracted titles against expected titles from filenames
- Synthetic data generation via Claude Code to prevent overfitting
- Iteration tracking with per-iteration results, feedback, and improvement plans
- Target: close to 100% accuracy on both real and generated test data
- Maximum 20 iterations before stopping
- Fully autonomous execution (no human intervention required)

## Non-Goals

- Changing the embedding model (must remain MiniLM / `Xenova/all-MiniLM-L6-v2`)
- Changes to tag classification or other text-classifier features
- GPU or server-side inference — algorithm must run on mobile device under 10 seconds
- A web UI or dashboard for viewing results
- Modifying the existing `cli.ts` (the new script is separate and focused)

## Technical Dependencies

- **Python 3.10+** — orchestration script
- **Node.js / tsx** — running the TypeScript title extraction CLI
- **Claude Code CLI** (`claude`) — headless mode for analysis, planning, and implementation
  - Opus 4.6 for analysis and reasoning tasks
  - Sonnet 4.6 for code implementation tasks
  - Haiku 4.5 for synthetic data generation (cost-efficient)
- **@huggingface/transformers** 3.8.1 — MiniLM embedding model (already installed)
- **Git** — commit tracking, hash extraction

## Detailed Design

### 1. Standalone Title Extraction CLI (`tools/extract-title.ts`)

A minimal script focused solely on title extraction. Unlike the existing `cli.ts` which does full classification comparison, this script:
- Takes a text file path as its only argument
- Loads the MiniLM model
- Runs `extractTitleWithEmbeddings` on the file contents
- Prints ONLY the extracted title to stdout (or empty string if none found)
- Exits with code 0 on success, 1 on error

```typescript
#!/usr/bin/env node
import { pipeline } from "@huggingface/transformers";
import { readFileSync } from "fs";
import { extractTitleWithEmbeddings } from "../lib/text-classifier/title-extractor";

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    process.exit(1);
  }

  const text = readFileSync(filePath, "utf-8");
  const embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

  const embed = async (t: string): Promise<Array<number>> => {
    const output = await embedder(t, { pooling: "mean", normalize: true });
    return Array.from(output.data);
  };

  const title = await extractTitleWithEmbeddings(text, embed);
  process.stdout.write(title ?? "");
}

main().catch(() => process.exit(1));
```

### 2. Input File Convention

Files live in `tools/title-loop/input/`:

- **Real OCR data**: `{EXPECTED_TITLE}.real.txt`
  - The expected title is the filename stem before `.real.txt`
  - Multiple expected titles separated by `+` (e.g., `Tomato Soup+Garlic Bread.real.txt`)
- **Generated OCR data**: `{EXPECTED_TITLE}.generated.{ITERATION}.txt`
  - Created during the loop by Claude Code
  - 100 files per iteration

### 3. Title Matching Logic

The evaluation compares extracted title against expected title:

```python
def titles_match(extracted: str, expected: str) -> bool:
    """
    Binary match: does the extracted title contain the expected title(s)?
    Expected may contain multiple titles separated by '+'.
    Comparison is case-insensitive and whitespace-normalized.
    """
    if not extracted:
        return False

    extracted_norm = normalize(extracted)
    expected_parts = [normalize(p) for p in expected.split("+")]

    return all(part in extracted_norm for part in expected_parts)

def normalize(s: str) -> str:
    return " ".join(s.lower().split())
```

### 4. Python Orchestration Script (`tools/title-loop.py`)

The main loop script. Directory structure:

```
tools/title-loop/
├── input/                          # Test corpus
│   ├── Tomato Soup.real.txt
│   ├── Pierogi.real.txt
│   └── ...
├── docs/
│   ├── iter.txt                    # Iteration log: "1 - 95.0%"
│   ├── 1-abc1234/
│   │   ├── results.txt             # Per-file results
│   │   ├── feedback.md             # Analysis of failures
│   │   └── improvement-plan.md     # Proposed changes
│   └── 2-def5678/
│       └── ...
├── extract-title.ts                # Standalone CLI
└── title-loop.py                   # Orchestration script
```

### 5. Loop Algorithm (Python pseudocode)

```python
MAX_ITERATIONS = 20
ACCURACY_THRESHOLD = 0.95  # "close to 100%"

for iteration in range(1, MAX_ITERATIONS + 1):
    # Step 1: Run extraction against real input files
    real_files = glob("input/*.real.txt")
    real_results = evaluate(real_files)
    real_accuracy = compute_accuracy(real_results)

    # Step 2-3: If real accuracy is high, test on generated data
    if real_accuracy >= ACCURACY_THRESHOLD:
        # Step 4: Generate 100 fake OCR texts via Claude Code
        generate_synthetic_data(iteration)

        # Step 5-6: Evaluate on generated data
        gen_files = glob(f"input/*.generated.{iteration}.txt")
        gen_results = evaluate(gen_files)
        gen_accuracy = compute_accuracy(gen_results)

        combined_accuracy = compute_accuracy(real_results + gen_results)
    else:
        combined_accuracy = real_accuracy
        gen_results = []

    # Step 7: Log iteration
    append_to_file("docs/iter.txt", f"{iteration} - {combined_accuracy:.1%}")

    # Step 8-9: Create iteration directory and results
    commit_hash = get_current_commit_hash()
    iter_dir = f"docs/{iteration}-{commit_hash}"
    mkdir(iter_dir)
    write_results(iter_dir, real_results + gen_results)

    # Step 10: Check if we're done
    if combined_accuracy >= ACCURACY_THRESHOLD:
        print(f"Target accuracy reached: {combined_accuracy:.1%}")
        break

    # Step 11: Analyze failures with Claude Code (Opus, plan mode)
    run_claude_headless(
        model="opus",
        mode="plan",
        prompt=f"""Analyze the title extraction failures in {iter_dir}/results.txt.
        Read the failing input files and the current implementation.
        Write your findings to {iter_dir}/feedback.md.
        Do not modify any code files."""
    )

    # Step 12: Plan improvements with Claude Code (Opus, plan mode)
    run_claude_headless(
        model="opus",
        mode="plan",
        prompt=f"""Read {iter_dir}/feedback.md and the current title-extractor.ts.
        Propose changes to improve accuracy. Algorithm must run on mobile
        under 10 seconds. Use /spec:create to prepare the plan.
        Save to {iter_dir}/improvement-plan.md."""
    )

    # Step 13: Validate plan
    run_claude_headless(
        model="opus",
        mode="plan",
        prompt=f"""Validate the plan in {iter_dir}/improvement-plan.md
        using /spec:validate. Address any feedback."""
    )

    # Step 14: Execute improvements with Claude Code (Sonnet, execution mode)
    run_claude_headless(
        model="sonnet",
        prompt=f"""Execute the improvement plan in {iter_dir}/improvement-plan.md.
        Use /spec:execute. Modify lib/text-classifier/title-extractor.ts
        and related files as needed."""
    )

    # Step 15: Verify tests pass and CLI works
    run_tests()
    verify_cli_runs()

    # Step 16: Commit all changes
    commit_hash = git_commit_all(f"title-extraction: iteration {iteration}")

    # Step 17: Prepare next iteration directory
    next_dir = f"docs/{iteration + 1}-{commit_hash}"
    mkdir(next_dir)
```

### 6. Claude Code Headless Invocation

The Python script uses `subprocess` to invoke Claude Code:

```python
import subprocess

def run_claude_headless(
    prompt: str,
    model: str = "sonnet",
    mode: str = "normal",
    timeout: int = 600
) -> str:
    """Run Claude Code in headless mode."""
    cmd = [
        "claude",
        "--print",           # headless mode, print output
        "--dangerously-skip-permissions",  # autonomous execution
    ]

    if model == "opus":
        cmd.extend(["--model", "claude-opus-4-6"])
    else:
        cmd.extend(["--model", "claude-sonnet-4-6"])

    result = subprocess.run(
        cmd,
        input=prompt,
        capture_output=True,
        text=True,
        timeout=timeout,
        cwd=PROJECT_ROOT
    )

    if result.returncode != 0:
        raise RuntimeError(f"Claude Code failed: {result.stderr}")

    return result.stdout
```

### 7. Synthetic Data Generation

Done via Claude Code headless with a prompt like:

```
Generate 100 realistic fake OCR recipe texts. For each, the text should look like
real OCR output from a scanned cookbook page - include typical OCR artifacts like
misrecognized characters, broken lines, page numbers, headers/footers.

Each file should have a clear recipe title that would be recognizable.
Save each to tools/title-loop/input/{RECIPE_TITLE}.generated.{ITERATION}.txt

Requirements:
- Mix of English and Polish recipes
- Variety: soups, mains, desserts, salads, appetizers
- Include multi-word titles, single-word titles, titles with special chars
- Include OCR noise: garbled text at top/bottom, broken words, stray numbers
- Some should have multiple recipes on one page
- Vary the position of the title (top, after noise, mid-page)
```

### 8. Accuracy Definition

- **Binary match per file**: Does the extracted title contain all expected title parts?
- **Accuracy**: Number of correct matches / total files evaluated
- **"Close to 100%"**: >= 95% accuracy (`ACCURACY_THRESHOLD = 0.95`)

## User Experience

This is a developer/CI tool with no user-facing UI. Interaction is:

```bash
# Run the standalone extractor
npx tsx tools/title-loop/extract-title.ts path/to/ocr-output.txt

# Run the full self-improving loop
python3 tools/title-loop/title-loop.py

# Check iteration history
cat tools/title-loop/docs/iter.txt
```

## Testing Strategy

### Unit Tests
- `extractTitle` heuristic: existing tests in `title-extractor.test.ts` (already 35 assertions)
- `extractTitleWithEmbeddings`: existing mock-based tests cover core logic

### Integration Tests
- The loop itself is the integration test — it evaluates against real OCR data
- Each iteration produces `results.txt` as a test report

### CLI Verification
- Step 15 of each iteration verifies: `npx tsx tools/title-loop/extract-title.ts input/FIRST_REAL_FILE.txt` exits 0 and produces output

### Test Data
- Real OCR text files must be manually curated and placed in `input/` before first run
- Generated files are created automatically and serve as regression tests

## Performance Considerations

- **Mobile constraint**: Algorithm must complete title extraction in <10 seconds on device
- **MiniLM model loading**: ~2-3 seconds on mobile, cached after first load
- **Candidate limit**: Capped at 25 candidates to bound embedding computation
- **Loop runtime**: Each iteration involves multiple Claude Code invocations (expect 5-15 minutes per iteration, up to ~5 hours for 20 iterations)

## Security Considerations

- `--dangerously-skip-permissions` flag is required for autonomous Claude Code execution. This should only be used in a developer environment, never in CI/CD
- Generated text files are plain text with no executable content
- The loop modifies only `lib/text-classifier/title-extractor.ts` and test files — no access to secrets or deployment

## Documentation

- `tools/title-loop/README.md` — usage instructions for running the loop
- `tools/title-loop/docs/iter.txt` — iteration history (auto-generated)
- Per-iteration directories contain self-documenting results, feedback, and plans

## Implementation Phases

### Phase 1: Core Infrastructure
- Create `tools/title-loop/` directory structure
- Implement `extract-title.ts` standalone CLI
- Implement `title-loop.py` with evaluation logic (steps 1-2, 7-9)
- Create initial set of real OCR input files in `input/`

### Phase 2: Self-Improving Loop
- Implement Claude Code headless invocation (steps 11-14)
- Implement synthetic data generation (steps 4-6)
- Implement test verification and git commit steps (steps 15-17)
- Wire up the full iteration loop with early stopping

### Phase 3: Polish
- Error handling and recovery (resume from failed iteration)
- Logging and progress reporting
- Timeout handling for Claude Code invocations

## Open Questions

1. **Initial test corpus**: How many real OCR input files should be seeded before the first run? Recommendation: at least 10-15 covering various recipe styles (English, Polish, multi-recipe pages, noisy OCR).
2. **Accuracy threshold**: Is 95% the right threshold for "close to 100%"? Could be adjusted to 98% or 100%.
3. **Generated data count**: 100 files per iteration could be reduced to 50 for faster iterations, or increased for better coverage.
4. **Claude Code timeout**: 600 seconds per invocation may not be enough for complex code changes. Consider 900s.
5. **Plan mode interaction**: Claude Code headless `--print` mode may not support `/spec:create` and `/spec:validate` slash commands natively. Alternative: pass the skill instructions directly in the prompt.

## References

- `lib/text-classifier/title-extractor.ts` — current implementation
- `lib/text-classifier/cli.ts` — existing CLI tool (reference, not modified)
- `lib/text-classifier/__tests__/title-extractor.test.ts` — existing test suite
- `lib/text-classifier/embeddings.ts` — cosine similarity utilities
- [Claude Code headless mode docs](https://docs.anthropic.com/en/docs/claude-code)
- MiniLM model: `Xenova/all-MiniLM-L6-v2` (384-dimensional embeddings)

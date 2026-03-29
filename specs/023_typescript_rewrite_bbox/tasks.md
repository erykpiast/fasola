# Task Breakdown: TypeScript Rewrite of Geometric Title Extraction

Generated: 2026-03-29
Source: specs/023_typescript_rewrite_bbox/feat-typescript-bbox-rewrite.md

## Overview

Port the Python geometric title extraction algorithm (`analyze_bboxes.py` heuristic 5, ~1326 lines) to TypeScript, then build an autonomous comparison loop that converges both implementations to identical output on all 407 test images.

## Phase 1: TypeScript Port + Comparison Harness

### Task 1.1: Port evaluation helpers to TypeScript

**Description**: Port the string normalization and fuzzy matching functions that are needed both by the extraction algorithm and the comparison harness.
**Size**: Medium
**Priority**: High
**Dependencies**: None
**Can run parallel with**: Nothing (foundation for all other tasks)

**Functions to implement in `lib/text-classifier/title-extractor-bbox.ts`:**

```typescript
// ── String normalization ──────────────────────────────────

/** Collapse whitespace and uppercase. */
function normalize(s: string): string {
  return s.trim().replace(/\s+/g, " ").toUpperCase();
}

/** Remove Polish ł/Ł and Unicode combining diacritics. */
function stripDiacritics(s: string): string {
  s = s.replace(/ł/g, "l").replace(/Ł/g, "L");
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** OCR digit-letter confusion: 0→O, 1→I, 5→S */
function ocrNormalize(s: string): string {
  return s.replace(/0/g, "O").replace(/1/g, "I").replace(/5/g, "S");
}

/** Full normalization pipeline for title matching. */
export function normForMatch(s: string): string {
  let r = normalize(s);
  // Strip quotes and apostrophes (OCR decorations / Polish „ quotes)
  r = r.replace(/["\u0027\u2018\u2019\u201C\u201D\u201E\u201F`]/g, "");
  // OCR: pipe is often misread letter I
  r = r.replace(/\|/g, "I");
  // Ensure consistent tokenization around &
  r = r.replace(/&/g, " & ");
  r = r.replace(/-/g, " ").replace(/_/g, " ");
  // Re-collapse whitespace
  r = r.replace(/\s+/g, " ").trim();
  return ocrNormalize(stripDiacritics(r));
}

// ── Levenshtein distance ──────────────────────────────────

/** Compute Levenshtein edit distance between two strings. */
function levenshtein(a: string, b: string): number {
  if (a.length < b.length) return levenshtein(b, a);
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const curr = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      curr.push(Math.min(curr[j] + 1, prev[j + 1] + 1, prev[j] + cost));
    }
    prev = curr;
  }
  return prev[b.length];
}

// ── Title matching (6-level fallback) ─────────────────────

/**
 * Multi-fallback fuzzy title comparison.
 * Levels: substring → word-set → adjacent-pairs → fuzzy → suffix/prefix → merged-word
 */
export function titlesMatch(extracted: string | undefined, expected: string): boolean {
  if (!extracted) return false;
  const extractedNorm = normForMatch(extracted);
  const expectedParts = expected.split("+").map(normForMatch);

  // Level 1: substring containment
  if (expectedParts.every((part) => extractedNorm.includes(part))) return true;

  // Level 2: word-level matching (handles reordering)
  const extractedWordList = extractedNorm.split(" ");
  const extractedWords = new Set(extractedWordList);
  if (expectedParts.every((part) => part.split(" ").every((w) => extractedWords.has(w))))
    return true;

  // Level 3: adjacent word-pair concatenation (e.g. "SHORT BREAD" → "SHORTBREAD")
  const adjacentPairs = new Set<string>();
  for (let i = 0; i < extractedWordList.length - 1; i++) {
    adjacentPairs.add(extractedWordList[i] + extractedWordList[i + 1]);
  }
  const allForms = new Set([...extractedWords, ...adjacentPairs]);
  if (expectedParts.every((part) => part.split(" ").every((w) => allForms.has(w))))
    return true;

  // Level 4: fuzzy word matching (Levenshtein distance)
  const fuzzyWordMatch = (w: string, wordList: Array<string>): boolean => {
    const thresh = w.length >= 5 ? 2 : 1;
    return wordList.some((ew) => levenshtein(w, ew) <= thresh);
  };
  if (
    expectedParts.every((part) =>
      part.split(" ").every((w) => fuzzyWordMatch(w, extractedWordList))
    )
  )
    return true;

  // Level 5: suffix/prefix matching (OCR cropping at image edges)
  const suffixWordMatch = (w: string, wordList: Array<string>): boolean => {
    if (fuzzyWordMatch(w, wordList)) return true;
    if (w.length < 4) return false;
    for (const ew of wordList) {
      if (ew.length < 4) continue;
      const shorter = Math.min(w.length, ew.length);
      const longer = Math.max(w.length, ew.length);
      if (shorter < longer * 0.5) continue;
      if (w.endsWith(ew) || ew.endsWith(w) || w.startsWith(ew) || ew.startsWith(w))
        return true;
    }
    return false;
  };
  if (
    expectedParts.every((part) =>
      part.split(" ").every((w) => suffixWordMatch(w, extractedWordList))
    )
  )
    return true;

  // Level 6: merged-word matching (OCR merging adjacent words)
  for (const part of expectedParts) {
    const words = part.split(" ");
    let i = 0;
    while (i < words.length) {
      const w = words[i];
      if (fuzzyWordMatch(w, extractedWordList)) {
        i++;
        continue;
      }
      if (i + 1 < words.length && w.length <= 2) {
        const merged = w + words[i + 1];
        if (fuzzyWordMatch(merged, extractedWordList)) {
          i += 2;
          continue;
        }
      }
      return false;
    }
  }
  return true;
}
```

**Python reference**: `analyze_bboxes.py` lines 28-159

**Acceptance Criteria**:
- [ ] All 6 levels of `titlesMatch()` work identically to Python
- [ ] `normForMatch()` handles Polish diacritics (ł, ą, ę, ś, ć, ź, ż, ó, ń)
- [ ] `levenshtein()` produces same distances as Python implementation
- [ ] File compiles with `npx tsc --noEmit`

---

### Task 1.2: Port core geometric extraction algorithm to TypeScript

**Description**: Port heuristic 5 (region clustering + scoring + validation) — the main algorithm body.
**Size**: Large
**Priority**: High
**Dependencies**: Task 1.1
**Can run parallel with**: Nothing

**Types to define:**

```typescript
interface BboxObservation {
  text: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
}

interface BboxInput {
  image: string;
  observations: Array<BboxObservation>;
}

interface Region {
  observations: Array<BboxObservation>;
  bbox: { x: number; y: number; width: number; height: number };
  lines: number;
  text: string;
  char_density: number;
  mean_line_height: number;
}
```

**Functions to port (Python → TypeScript), referencing `analyze_bboxes.py`:**

| Function | Lines | Key porting notes |
|----------|-------|-------------------|
| `detect_columns(observations, min_gap)` | 405-460 | Uses `sorted()` with lambda — use `Array.sort()` with index tiebreaker |
| `find_same_y_groups(observations, y_tolerance, height_ratio)` | 338-370 | `defaultdict(list)` → `Map<number, Array<...>>` with lazy init |
| `_cluster_column(observations, y_tolerance, region_gap)` | 540-722 | Largest function (~180 lines). Uses `statistics.mean()` — implement inline: `arr.reduce((a,b) => a+b, 0) / arr.length` |
| `cluster_into_regions(observations, y_tolerance, region_gap)` | 462-538 | Calls detect_columns, then _cluster_column per column |
| `_merge_stacked_title_lines(regions)` | 470-538 | Uses `id(r)` for set membership — use array index instead |
| `score_title_region(region, all_regions)` | 725-790 | Pure math, straightforward port. Weights: [0.20, 0.15, 0.25, 0.10, 0.05, 0.15, 0.10] minus gutter_penalty |
| `validate_title_text(text)` | 793-809 | Regex patterns: `_MEASUREMENT_RE`, `_SECTION_LABELS` set, `_RECIPE_METADATA_RE` |
| `_strip_trailing_ingredients(text)` | 812-827 | Simple regex + truncation |
| `_extract_leading_title(region)` | 830-864 | Observation sorting + Y-band grouping |
| `heuristic_region_clustering(observations, y_tolerance, region_gap)` | 867-1070 | Main entry point (~200 lines). Greedy multi-region merge + validation + multi-recipe detection + subtitle scan |

**Key constants to port exactly:**

```typescript
// Regex patterns from analyze_bboxes.py
const MEASUREMENT_RE = /\d+\s*(g|ml|kg|cup|cups|tbsp|tsp|tablespoon|teaspoon|oz|ounce|lb|pound|piece|pieces|clove|cloves|bunch|can|jar|bottle|slice|slices|łyżka|łyżki|łyżeczka|łyżeczki|szklanka|szklankę|szklanki|plaster|plastry|ząbek|ząbków|ząbki|opakowanie|puszka|puszki|sztuka|sztuk|sztuki)\b/i;

const SECTION_LABELS = new Set([
  "ingredients", "directions", "instructions", "method", "preparation",
  "steps", "notes", "tip", "tips", "garnish", "topping", "sauce",
  "dressing", "glaze", "filling", "frosting", "crust", "batter",
  "skladniki", "przygotowanie", "wykonanie", "sposob przygotowania",
  "sposob wykonania", "sos", "polewa", "krem", "nadzienie", "ciasto",
  "dekoracja", "marynata", "dodatki",
]);

const RECIPE_METADATA_RE = /DLA\s+\d+\s+OSOB|GOTOWANIE|SERVES?\s+\d|MAKES?\s+\d|YIELD|PIECZENIE|CZAS|NA\s+\d+\s+(PORCJ|OSOB|PAPRYKI|SZTUK)/i;
```

**Scoring weights (must match exactly):**
- line_count: 0.20
- relative_line_height: 0.15
- vertical_position: 0.25
- char_density: 0.10
- text_length: 0.05
- caps_boost: 0.15
- width_score: 0.10
- gutter_penalty: -0.30 (conditional)

**Public API:**

```typescript
export function extractTitleFromBboxes(input: BboxInput): string | undefined;
```

**Acceptance Criteria**:
- [ ] All 10 functions ported with matching logic
- [ ] Constants and regex patterns match Python exactly
- [ ] File compiles with `npx tsc --noEmit`
- [ ] Exports `extractTitleFromBboxes`, `titlesMatch`, `normForMatch`

---

### Task 1.3: Create TypeScript CLI wrapper

**Description**: Create a thin CLI script that loads a bbox JSON file and runs the TypeScript extraction.
**Size**: Small
**Priority**: High
**Dependencies**: Task 1.2
**Can run parallel with**: Task 1.4

**File:** `tools/title-loop/extract-bbox.ts`

```typescript
#!/usr/bin/env npx tsx
/**
 * CLI wrapper for running TypeScript bbox title extraction on a single file.
 * Usage: npx tsx tools/title-loop/extract-bbox.ts <bbox-json-path>
 * Output: prints extracted title to stdout (or empty string if none)
 */
import { readFileSync } from "fs";
import { extractTitleFromBboxes } from "../../lib/text-classifier/title-extractor-bbox";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: npx tsx tools/title-loop/extract-bbox.ts <bbox-json-path>");
  process.exit(1);
}

const data = JSON.parse(readFileSync(filePath, "utf-8"));

// Handle both single-image JSON and _all.json format
const observations = data.observations ?? data;
const image = filePath.replace(/\.json$/, "").split("/").pop() ?? "";

const title = extractTitleFromBboxes({ image, observations });
console.log(title ?? "");
```

**Acceptance Criteria**:
- [ ] `npx tsx tools/title-loop/extract-bbox.ts tools/title-loop/bboxes/IMG_1358.json` prints a title
- [ ] Exits cleanly with empty output when no title found
- [ ] Handles both individual bbox JSON files and entries from `_all.json`

---

### Task 1.4: Create comparison harness

**Description**: Python script that runs both implementations on all 407 bbox files and outputs divergences.
**Size**: Medium
**Priority**: High
**Dependencies**: Task 1.2
**Can run parallel with**: Task 1.3

**File:** `tools/title-loop/compare-implementations.py`

```python
#!/usr/bin/env python3
"""
Compare Python and TypeScript bbox title extraction on all test images.

Runs both implementations on each bbox JSON file from bboxes/_all.json,
compares extracted title strings, and outputs a failures report.

Output: tools/title-loop/bboxes/_parity_failures.json
"""
import json
import subprocess
import sys
from pathlib import Path

LOOP_DIR = Path(__file__).resolve().parent
BBOXES_DIR = LOOP_DIR / "bboxes"
ALL_JSON = BBOXES_DIR / "_all.json"
PROJECT_ROOT = LOOP_DIR.parent.parent

sys.path.insert(0, str(LOOP_DIR))
from analyze_bboxes import (
    heuristic_region_clustering,
    load_ground_truth,
    match_images_to_ground_truth,
)


def run_ts_extract(bbox_json_path: str) -> str:
    """Run TypeScript extraction via subprocess, return extracted title."""
    result = subprocess.run(
        ["npx", "tsx", str(LOOP_DIR / "extract-bbox.ts"), bbox_json_path],
        capture_output=True, text=True, timeout=30,
        cwd=str(PROJECT_ROOT),
    )
    return result.stdout.strip()


def main():
    all_bboxes = json.loads(ALL_JSON.read_text())

    failures = []
    total = 0

    for entry in all_bboxes:
        image = entry["image"]
        observations = entry["observations"]
        total += 1

        # Python result
        py_title = heuristic_region_clustering(observations) or ""

        # TypeScript result — write temp JSON, run CLI
        temp_path = BBOXES_DIR / f"_temp_{image}.json"
        temp_path.write_text(json.dumps({"observations": observations}))
        try:
            ts_title = run_ts_extract(str(temp_path))
        except subprocess.TimeoutExpired:
            ts_title = "(timeout)"
        finally:
            temp_path.unlink(missing_ok=True)

        if py_title != ts_title:
            failures.append({
                "image": image,
                "python_title": py_title,
                "ts_title": ts_title,
            })

    # Summary
    parity = total - len(failures)
    print(f"Parity: {parity}/{total} ({parity/total:.1%})")
    print(f"Divergences: {len(failures)}")

    if failures:
        print("\nFirst 20 divergences:")
        for f in failures[:20]:
            print(f"  {f['image']}: PY=\"{f['python_title']}\" TS=\"{f['ts_title']}\"")

    # Write failures JSON
    output = BBOXES_DIR / "_parity_failures.json"
    output.write_text(json.dumps(failures, indent=2, ensure_ascii=False))
    print(f"\nFull report: {output}")

    return len(failures)


if __name__ == "__main__":
    sys.exit(0 if main() == 0 else 1)
```

**Acceptance Criteria**:
- [ ] Runs both Python and TypeScript on all 407 images
- [ ] Outputs divergence count and first 20 examples to stdout
- [ ] Writes full failure list to `bboxes/_parity_failures.json`
- [ ] Exit code 0 when 0 divergences, 1 otherwise
- [ ] Each TypeScript invocation has a 30s timeout

---

## Phase 2: Autonomous Parity Loop

### Task 2.1: Create the autonomous parity loop

**Description**: Python script that iteratively runs the comparison harness and feeds divergences to Claude Code headless for fixing.
**Size**: Large
**Priority**: High
**Dependencies**: Tasks 1.3, 1.4
**Can run parallel with**: Nothing

**File:** `tools/title-loop/bbox-parity-loop.py`

Reuse the proven patterns from `tools/title-loop/bbox-loop.py`:
- `ClaudeStallError` exception class
- `run_claude()` function with stream-json parsing, stall detection (180s), hard timeout (1800s)
- Threaded stdout reader with activity monitoring
- Retry logic (up to 3 attempts per iteration)

**Configuration constants:**

```python
MAX_ITERATIONS = 20
PARITY_THRESHOLD = 1.0  # target: 100% parity
CLAUDE_TIMEOUT = 1800   # 30 minutes per session
CLAUDE_STALL_TIMEOUT = 180  # kill if no output for 3 minutes
CLAUDE_MAX_RETRIES = 3
CLAUDE_MODEL = "opus"
TS_FILE = "lib/text-classifier/title-extractor-bbox.ts"
PY_FILE = "tools/title-loop/analyze_bboxes.py"
```

**Loop logic (pseudocode):**

```python
for iteration in range(1, MAX_ITERATIONS + 1):
    # Step 1: Compile check
    compile_result = subprocess.run(
        ["npx", "tsc", "--noEmit", TS_FILE],
        capture_output=True, text=True, cwd=PROJECT_ROOT,
    )
    if compile_result.returncode != 0:
        # Feed compile errors to Claude
        prompt = build_compile_fix_prompt(compile_result.stderr)
        run_claude(prompt)
        continue

    # Step 2: Run comparison
    failures = run_comparison()  # calls compare-implementations.py
    if len(failures) == 0:
        print("PARITY ACHIEVED!")
        break

    # Step 3: Build prompt with failures
    prompt = build_parity_prompt(iteration, failures)

    # Step 4: Run Claude Code headless (with retry)
    for attempt in range(CLAUDE_MAX_RETRIES):
        try:
            run_claude(prompt)
            break
        except (ClaudeStallError, RuntimeError) as e:
            print(f"  Attempt {attempt+1} failed: {e}")

    # Step 5: Regression check
    new_failures = run_comparison()
    if len(new_failures) > len(failures):
        print(f"  REGRESSION: {len(failures)} → {len(new_failures)}, reverting")
        subprocess.run(["git", "checkout", TS_FILE], cwd=PROJECT_ROOT)
        continue

    # Step 6: Log iteration
    log_iteration(iteration, len(failures), len(new_failures))
```

**Prompt template for parity fixes:**

```python
def build_parity_prompt(iteration, failures):
    failure_text = "\n".join(
        f"  - {f['image']}: python=\"{f['python_title']}\" typescript=\"{f['ts_title']}\""
        for f in failures[:15]
    )
    return f"""You are fixing the TypeScript port of a Python bbox title extraction algorithm.

## Parity status

Divergences: {len(failures)} out of 407 images

## Divergence examples (iteration {iteration})

{failure_text}

## Your task

1. Read both source files:
   - Python reference: tools/title-loop/analyze_bboxes.py (the CORRECT implementation)
   - TypeScript port: lib/text-classifier/title-extractor-bbox.ts (the file to FIX)
2. For 2-3 failure images, read the bbox JSON from tools/title-loop/bboxes/{{IMAGE}}.json
3. Trace through both implementations mentally to find where they diverge
4. Make a SINGLE targeted fix to the TypeScript file
5. Verify by running: python3 tools/title-loop/compare-implementations.py
6. Commit with a descriptive message

## Rules

- Only modify lib/text-classifier/title-extractor-bbox.ts
- The Python implementation is the GROUND TRUTH — never change it
- Make ONE fix per iteration
- Commit changes after fixing
"""
```

**Prompt template for compile fixes:**

```python
def build_compile_fix_prompt(errors):
    return f"""The TypeScript bbox title extraction file has compile errors. Fix them.

## Compile errors

{errors}

## Your task

1. Read lib/text-classifier/title-extractor-bbox.ts
2. Fix the compile errors
3. Verify with: npx tsc --noEmit lib/text-classifier/title-extractor-bbox.ts
4. Commit the fix
"""
```

**Claude Code invocation (reuse from bbox-loop.py):**

```python
cmd = [
    "claude", "--print", "--dangerously-skip-permissions",
    "--verbose",
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--model", "claude-opus-4-6",
]
```

**Acceptance Criteria**:
- [ ] Runs comparison, detects divergences, feeds to Claude headless
- [ ] Compile-check before comparison prevents wasted iterations
- [ ] Regression detection reverts bad changes
- [ ] Stall detection kills stuck Claude sessions after 180s
- [ ] Retries failed sessions up to 3 times
- [ ] Logs iteration progress (divergence count per iteration)
- [ ] Exits with success when 0 divergences achieved

---

### Task 2.2: Run the parity loop to convergence

**Description**: Execute the loop, monitor progress, and achieve 0 divergences.
**Size**: Large (automated, but may need manual intervention)
**Priority**: High
**Dependencies**: Task 2.1
**Can run parallel with**: Nothing

**Execution:**

```bash
cd /Users/eryk.napierala/Projects/fasola
MPLBACKEND=Agg python3 tools/title-loop/bbox-parity-loop.py
```

**Expected behavior:**
- First run will have many divergences (initial port may be rough)
- Each iteration should reduce divergences
- Loop converges when Claude fixes all remaining issues
- If loop stalls (same divergence count for 3+ iterations), may need manual review

**Acceptance Criteria**:
- [ ] 0 divergences on all 407 bbox JSON files
- [ ] TypeScript output matches Python output exactly for every image
- [ ] All changes committed with descriptive messages

---

## Phase 3: App Integration

### Task 3.1: Thread bounding box data through OCR bridge

**Description**: Extend OcrResult to include bounding box observations from the native text-extractor module.
**Size**: Small
**Priority**: Medium
**Dependencies**: Task 2.2
**Can run parallel with**: Nothing

**Changes required:**

1. **`lib/photo-processor/ocr-bridge/types.ts`** — add observations field:

```typescript
import type { TextObservation } from "text-extractor";

export interface OcrResult {
  success: boolean;
  text?: string;
  textBlocks?: Array<string>;
  confidence?: number;
  observations?: Array<TextObservation>;  // NEW: bounding box data
  error?: string;
}
```

2. **`lib/photo-processor/ocr-bridge/index.native.ts`** — switch to `extractTextWithBounds()`:

```typescript
import { extractTextWithBounds } from "text-extractor";

// Replace:
//   const textBlocks = await extractTextFromImage(imageUri);
// With:
const result = await extractTextWithBounds(imageUri);
const textBlocks = result.map((obs) => obs.text);
const observations = result;
// Include observations in returned OcrResult
```

3. **Web platform** (`index.web.ts`) — no change. `observations` stays `undefined`.

**Acceptance Criteria**:
- [ ] `OcrResult` type includes optional `observations` field
- [ ] Native OCR bridge populates `observations` with `TextObservation` array
- [ ] Web OCR bridge still works (no breaking changes)
- [ ] Existing text extraction behavior unchanged

---

### Task 3.2: Wire bbox extraction into text classifier

**Description**: Use the new bbox-based title extraction when bounding box data is available.
**Size**: Small
**Priority**: Medium
**Dependencies**: Tasks 2.2, 3.1
**Can run parallel with**: Task 3.3

**In `lib/text-classifier/index.native.ts`:**

```typescript
import { extractTitleFromBboxes } from "./title-extractor-bbox";

// Inside classifyText() or equivalent, before the existing title extraction:
if (ocrResult.observations && ocrResult.observations.length > 0) {
  const bboxTitle = extractTitleFromBboxes({
    image: "native",
    observations: ocrResult.observations.map((obs) => ({
      text: obs.text,
      confidence: obs.confidence,
      bbox: obs.bounds, // TextObservation uses "bounds", BboxObservation uses "bbox"
    })),
  });
  if (bboxTitle) {
    // Use bbox-extracted title, skip embedding-based extraction
    return { title: bboxTitle, suggestions, processingTimeMs };
  }
}

// Existing heuristic + embeddings fallback continues below
```

**Note the field name mapping**: The native `TextObservation` uses `bounds` while the algorithm uses `bbox`. Map at the call site.

**Acceptance Criteria**:
- [ ] Bbox title extraction is tried first when observations are available
- [ ] Falls back to existing heuristic+embeddings when observations are undefined
- [ ] Falls back when bbox extraction returns undefined
- [ ] No behavior change on web platform

---

### Task 3.3: Add unit tests for key functions

**Description**: Write unit tests for the most important extracted functions.
**Size**: Medium
**Priority**: Medium
**Dependencies**: Task 2.2
**Can run parallel with**: Task 3.2

**File:** `lib/text-classifier/__tests__/title-extractor-bbox.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { normForMatch, titlesMatch, extractTitleFromBboxes } from "../title-extractor-bbox";

// Purpose: Verify normalization handles Polish diacritics and OCR artifacts correctly
describe("normForMatch", () => {
  it("strips Polish diacritics", () => {
    expect(normForMatch("Żurek")).toBe("ZUREK");
    expect(normForMatch("Łosoś")).toBe("LOSOS");
    expect(normForMatch("ćma")).toBe("CMA");
  });

  it("normalizes OCR digit-letter confusion", () => {
    expect(normForMatch("Z0PA")).toBe("ZOPA");
    expect(normForMatch("P1EROG1")).toBe("PIEROGI");
  });

  it("handles pipe-as-I substitution", () => {
    expect(normForMatch("P|EROG|")).toBe("PIEROGI");
  });

  it("collapses whitespace and strips quotes", () => {
    expect(normForMatch("  „ŻUREK"  ")).toBe("ZUREK");
  });

  it("normalizes hyphens and underscores to spaces", () => {
    expect(normForMatch("SLOW-ROASTED")).toBe("SLOW ROASTED");
  });
});

// Purpose: Verify multi-level fuzzy matching handles real OCR errors
describe("titlesMatch", () => {
  it("matches exact titles", () => {
    expect(titlesMatch("ŻUREK", "ŻUREK")).toBe(true);
  });

  it("matches despite diacritic differences", () => {
    expect(titlesMatch("ZUREK", "ŻUREK")).toBe(true);
  });

  it("matches with OCR digit confusion", () => {
    expect(titlesMatch("P1EROG1", "PIEROGI")).toBe(true);
  });

  it("matches reordered words", () => {
    expect(titlesMatch("PIE BLUEBERRY", "BLUEBERRY PIE")).toBe(true);
  });

  it("matches merged words (SHORT BREAD → SHORTBREAD)", () => {
    expect(titlesMatch("SHORTBREAD", "SHORT BREAD")).toBe(true);
  });

  it("matches with suffix/prefix OCR cropping", () => {
    expect(titlesMatch("ZONE", "WĘDZONE")).toBe(true);
  });

  it("handles compound titles with + separator", () => {
    expect(titlesMatch("ŻUREK BARSZCZ", "ŻUREK+BARSZCZ")).toBe(true);
  });

  it("returns false for completely different titles", () => {
    expect(titlesMatch("ŻUREK", "PIEROGI")).toBe(false);
  });

  it("returns false for undefined extracted", () => {
    expect(titlesMatch(undefined, "ŻUREK")).toBe(false);
  });
});

// Purpose: Verify title validation rejects non-title content
describe("validateTitleText (via extractTitleFromBboxes)", () => {
  // These test the full pipeline with synthetic observations
  it("rejects ingredient measurements", () => {
    const result = extractTitleFromBboxes({
      image: "test",
      observations: [
        { text: "200 g mąki", confidence: 0.9, bbox: { x: 0.1, y: 0.1, width: 0.5, height: 0.08 } },
      ],
    });
    expect(result).toBeUndefined();
  });

  it("extracts a clear title from simple layout", () => {
    const result = extractTitleFromBboxes({
      image: "test",
      observations: [
        { text: "ŻUREK", confidence: 0.99, bbox: { x: 0.15, y: 0.08, width: 0.7, height: 0.05 } },
        { text: "Składniki", confidence: 0.95, bbox: { x: 0.1, y: 0.25, width: 0.3, height: 0.02 } },
        { text: "200 g mąki", confidence: 0.9, bbox: { x: 0.1, y: 0.30, width: 0.4, height: 0.02 } },
        { text: "100 ml wody", confidence: 0.9, bbox: { x: 0.1, y: 0.34, width: 0.4, height: 0.02 } },
      ],
    });
    expect(result).toBe("ŻUREK");
  });
});
```

**Acceptance Criteria**:
- [ ] Tests cover normalization, matching, and basic extraction
- [ ] Tests can fail to reveal real issues (not trivially passing)
- [ ] Tests pass with `pnpm test -- "lib/text-classifier/__tests__/title-extractor-bbox.test.ts"`
- [ ] Each test has a purpose comment

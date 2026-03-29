---
schema: 1
id: 20
title: "[P1.3] Create TypeScript CLI wrapper (extract-bbox.ts)"
status: done
created: "2026-03-29T19:39:32.717Z"
updated: "2026-03-29T19:46:52.135Z"
tags:
  - phase1
  - tooling
  - high-priority
  - small
dependencies:
  - 19
---
## Description
Create thin CLI that loads bbox JSON and runs extractTitleFromBboxes, printing result to stdout

## Details
Create tools/title-loop/extract-bbox.ts — a thin CLI wrapper that loads a bbox JSON file and runs the TypeScript extraction algorithm.

File: tools/title-loop/extract-bbox.ts

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
const observations = data.observations ?? data;
const image = filePath.replace(/\.json$/, "").split("/").pop() ?? "";
const title = extractTitleFromBboxes({ image, observations });
console.log(title ?? "");
```

Handle both formats:
- Individual bbox JSON: { "observations": [...] }
- Direct observation array: [...]

## Validation
npx tsx tools/title-loop/extract-bbox.ts tools/title-loop/bboxes/IMG_1358.json prints a title. Exits cleanly with empty output when no title found. Handles both individual bbox JSON and direct observation arrays.
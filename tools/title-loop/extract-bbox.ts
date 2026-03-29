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
  console.error(
    "Usage: npx tsx tools/title-loop/extract-bbox.ts <bbox-json-path>",
  );
  process.exit(1);
}

const data = JSON.parse(readFileSync(filePath, "utf-8"));

// Handle both single-image JSON { observations: [...] } and direct array [...]
const observations = data.observations ?? data;

const title = extractTitleFromBboxes(observations);
console.log(title ?? "");

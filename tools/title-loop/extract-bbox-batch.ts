#!/usr/bin/env npx tsx
/**
 * Batch mode: extract titles from all images in _all.json.
 * Usage: npx tsx tools/title-loop/extract-bbox-batch.ts
 * Output: JSON array of { image, title } to stdout
 */
import { readFileSync } from "fs";
import { extractTitleFromBboxes } from "../../lib/text-classifier/title-extractor-bbox";

const allJsonPath =
  process.argv[2] || "tools/title-loop/bboxes/_all.json";
const allBboxes = JSON.parse(readFileSync(allJsonPath, "utf-8"));

const results: Array<{ image: string; title: string }> = [];

for (const entry of allBboxes) {
  const title = extractTitleFromBboxes(entry.observations) ?? "";
  results.push({ image: entry.image, title });
}

console.log(JSON.stringify(results));

#!/usr/bin/env node

/**
 * Standalone title extraction CLI.
 * Reads a text file, runs extractTitleWithEmbeddings, prints the title to stdout.
 * Exit 0 on success, 1 on error.
 *
 * Usage: npx tsx tools/title-loop/extract-title.ts <text-file-path>
 */

import { readFileSync } from "fs";
import {
  embedText,
  loadEmbedder,
  type FeatureEmbedder,
} from "@/lib/text-classifier/embedder";
import { extractTitleWithEmbeddings } from "@/lib/text-classifier/title-extractor";

let cachedEmbedder: FeatureEmbedder | null = null;

async function getEmbedder(): Promise<FeatureEmbedder> {
  if (!cachedEmbedder) {
    cachedEmbedder = await loadEmbedder();
  }
  return cachedEmbedder;
}

async function embed(text: string): Promise<Array<number>> {
  return embedText(await getEmbedder(), text);
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npx tsx tools/title-loop/extract-title.ts <text-file>");
    process.exit(1);
  }

  const text = readFileSync(filePath, "utf-8");
  const title = await extractTitleWithEmbeddings(text, embed);
  process.stdout.write(title ?? "");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

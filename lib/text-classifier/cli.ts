#!/usr/bin/env node

/**
 * CLI for testing text classifier in Node.js using MiniLM embeddings
 * Usage: npx tsx lib/text-classifier/cli.ts <text-file-path>
 */

import { pipeline } from "@huggingface/transformers";
import { readFileSync } from "fs";
import type { ClassificationCategory } from "./index.d";
import {
  ALL_CATEGORY_KEYS,
  ALL_CUISINE_KEYS,
  ALL_SEASON_KEYS,
  CATEGORY_LABELS,
  CUISINE_LABELS,
  SEASON_LABELS,
} from "./labels";
import { extractTitle } from "./title-extractor";

interface TagSuggestion {
  tag: string;
  confidence: number;
  category: ClassificationCategory;
}

interface LabelEmbedding {
  key: string;
  category: ClassificationCategory;
  embedding: Array<number>;
}

interface EmbeddingOutput {
  data: Float32Array | Array<number>;
}

function cosineSimilarity(
  embedding1: Array<number>,
  embedding2: Array<number>
): number {
  let dotProduct = 0;
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
  }
  return dotProduct;
}

async function computeLabelEmbeddings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  embedder: any
): Promise<Array<LabelEmbedding>> {
  const labelEmbeddings: Array<LabelEmbedding> = [];

  for (const key of ALL_SEASON_KEYS) {
    const description = SEASON_LABELS[key];
    const output = (await embedder(description, {
      pooling: "mean",
      normalize: true,
    })) as EmbeddingOutput;
    labelEmbeddings.push({
      key,
      category: "season",
      embedding: Array.from(output.data),
    });
  }

  for (const key of ALL_CUISINE_KEYS) {
    const description = CUISINE_LABELS[key];
    const output = (await embedder(description, {
      pooling: "mean",
      normalize: true,
    })) as EmbeddingOutput;
    labelEmbeddings.push({
      key,
      category: "cuisine",
      embedding: Array.from(output.data),
    });
  }

  for (const key of ALL_CATEGORY_KEYS) {
    const description = CATEGORY_LABELS[key];
    const output = (await embedder(description, {
      pooling: "mean",
      normalize: true,
    })) as EmbeddingOutput;
    labelEmbeddings.push({
      key,
      category: "food-category",
      embedding: Array.from(output.data),
    });
  }

  return labelEmbeddings;
}

async function classifyWithEmbeddings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  embedder: any,
  text: string,
  labelEmbeddings: Array<LabelEmbedding>
): Promise<Array<TagSuggestion>> {
  const output = (await embedder(text, {
    pooling: "mean",
    normalize: true,
  })) as EmbeddingOutput;
  const textEmbedding: Array<number> = Array.from(output.data);

  const suggestions: Array<TagSuggestion> = [];
  const SIMILARITY_THRESHOLD = 0.453;

  for (const label of labelEmbeddings) {
    const similarity = cosineSimilarity(textEmbedding, label.embedding);

    if (similarity >= SIMILARITY_THRESHOLD) {
      suggestions.push({
        tag: `#${label.key}`,
        confidence: similarity,
        category: label.category,
      });
    }
  }

  return suggestions;
}

/**
 * Run the full classification pipeline
 */
async function runClassification(text: string): Promise<void> {
  const startTime = Date.now();

  console.log("=".repeat(60));
  console.log("TEXT CLASSIFIER TEST (MiniLM Embeddings)");
  console.log("=".repeat(60));
  console.log();

  // Extract title
  console.log("Extracting title...");
  const title = extractTitle(text);
  console.log(`Title: ${title || "(none found)"}`);
  console.log();

  console.log("Loading MiniLM embedding model (this may take a moment)...");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const embedder: any = await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2",
    {
      progress_callback: (progress: {
        status?: string;
        loaded?: number;
        total?: number;
      }) => {
        if (
          progress.status === "progress" &&
          progress.loaded &&
          progress.total
        ) {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          process.stdout.write(`\rDownloading: ${percent}%`);
        } else if (progress.status === "done") {
          process.stdout.write("\rDownload complete!\n");
        }
      },
    }
  );

  console.log("Model loaded!");
  console.log();

  console.log("Computing label embeddings...");
  const labelEmbeddings = await computeLabelEmbeddings(embedder);
  console.log(`Cached ${labelEmbeddings.length} label embeddings`);
  console.log();

  console.log("Classifying text...");
  const allSuggestions = await classifyWithEmbeddings(
    embedder,
    text,
    labelEmbeddings
  );

  allSuggestions.sort((a, b) => b.confidence - a.confidence);

  console.log();
  console.log("=".repeat(60));
  console.log("RESULTS");
  console.log("=".repeat(60));
  console.log();

  if (allSuggestions.length === 0) {
    console.log("No tags found");
  } else {
    console.log("Tag Suggestions (similarity scores):");
    console.log();

    const grouped = {
      season: allSuggestions.filter((s) => s.category === "season"),
      cuisine: allSuggestions.filter((s) => s.category === "cuisine"),
      "food-category": allSuggestions.filter(
        (s) => s.category === "food-category"
      ),
    };

    for (const [category, suggestions] of Object.entries(grouped)) {
      if (suggestions.length > 0) {
        console.log(`  ${category.toUpperCase()}:`);
        for (const suggestion of suggestions) {
          const similarity = suggestion.confidence.toFixed(3);
          const bar = "█".repeat(Math.floor(suggestion.confidence * 50));
          console.log(`    ${suggestion.tag.padEnd(20)} ${similarity} ${bar}`);
        }
        console.log();
      }
    }
  }

  const totalTime = Date.now() - startTime;
  console.log(
    `Processing time: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)`
  );
  console.log();
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: npx tsx lib/text-classifier/cli.ts <text-file-path>");
    console.error("");
    console.error("Example:");
    console.error("  npx tsx lib/text-classifier/cli.ts recipe.txt");
    process.exit(1);
  }

  const filePath = args[0];

  try {
    const text = readFileSync(filePath, "utf-8");

    if (!text.trim()) {
      console.error(`Error: File '${filePath}' is empty`);
      process.exit(1);
    }

    await runClassification(text);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`Error: File '${filePath}' not found`);
      process.exit(1);
    }
    console.error("Error:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

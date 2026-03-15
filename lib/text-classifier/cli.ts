#!/usr/bin/env node

/**
 * CLI for testing text classifier in Node.js
 * Supports both MiniLM embeddings and TF-IDF for comparison
 * Usage: npx tsx lib/text-classifier/cli.ts <text-file-path> [--method=embeddings|tfidf|both]
 */

import { readFileSync } from "fs";
import { classifyWithEmbeddings, type LabelEmbedding } from "./embeddings";
import {
  embedText,
  loadEmbedder,
  type FeatureEmbedder,
} from "./embedder";
import type { ClassificationCategory } from "./index.d";
import {
  ALL_CATEGORY_KEYS,
  ALL_CUISINE_KEYS,
  ALL_SEASON_KEYS,
  CATEGORY_LABELS,
  CUISINE_LABELS,
  SEASON_LABELS,
} from "./labels";
import { classifyWithTfIdf } from "./tfidf";
import {
  extractTitle,
  extractTitleWithEmbeddings,
} from "./title-extractor";

interface TagSuggestion {
  tag: string;
  confidence: number;
  category: ClassificationCategory;
}

async function computeLabelEmbeddings(
  embedder: FeatureEmbedder
): Promise<Array<LabelEmbedding>> {
  const labelEmbeddings: Array<LabelEmbedding> = [];

  for (const key of ALL_SEASON_KEYS) {
    const description = SEASON_LABELS[key];
    const embedding = await embedText(embedder, description);
    labelEmbeddings.push({ key, category: "season", embedding });
  }

  for (const key of ALL_CUISINE_KEYS) {
    const description = CUISINE_LABELS[key];
    const embedding = await embedText(embedder, description);
    labelEmbeddings.push({ key, category: "cuisine", embedding });
  }

  for (const key of ALL_CATEGORY_KEYS) {
    const description = CATEGORY_LABELS[key];
    const embedding = await embedText(embedder, description);
    labelEmbeddings.push({ key, category: "food-category", embedding });
  }

  return labelEmbeddings;
}

async function generateEmbeddingAndClassify(
  embedder: FeatureEmbedder,
  text: string,
  labelEmbeddings: Array<LabelEmbedding>
): Promise<Array<TagSuggestion>> {
  const textEmbedding = await embedText(embedder, text);
  return classifyWithEmbeddings(textEmbedding, labelEmbeddings);
}

function printResults(
  allSuggestions: Array<TagSuggestion>,
  methodName: string
): void {
  console.log("=".repeat(60));
  console.log(`RESULTS (${methodName})`);
  console.log("=".repeat(60));
  console.log();

  if (allSuggestions.length === 0) {
    console.log("No tags found");
  } else {
    console.log("Tag Suggestions (confidence scores):");
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
          const confidence = suggestion.confidence.toFixed(3);
          const bar = "█".repeat(Math.floor(suggestion.confidence * 50));
          console.log(`    ${suggestion.tag.padEnd(20)} ${confidence} ${bar}`);
        }
        console.log();
      }
    }
  }
}

/**
 * Run TF-IDF classification
 */
async function runTfIdfClassification(text: string): Promise<void> {
  const startTime = Date.now();

  console.log("=".repeat(60));
  console.log("TEXT CLASSIFIER TEST (TF-IDF)");
  console.log("=".repeat(60));
  console.log();

  console.log("Classifying text with TF-IDF...");
  const allSuggestions = classifyWithTfIdf(text);
  allSuggestions.sort((a, b) => b.confidence - a.confidence);

  console.log();
  printResults(allSuggestions, "TF-IDF");

  const totalTime = Date.now() - startTime;
  console.log(
    `Processing time: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)`
  );
  console.log();
}

async function loadEmbedderWithProgress(): Promise<FeatureEmbedder> {
  console.log("Loading MiniLM embedding model (this may take a moment)...");
  const embedder = await loadEmbedder((progress) => {
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
  });

  console.log("Model loaded!");
  console.log();
  return embedder;
}

/**
 * Run embeddings classification
 */
async function runEmbeddingsClassification(
  text: string,
  existingEmbedder?: FeatureEmbedder
): Promise<void> {
  const startTime = Date.now();

  console.log("=".repeat(60));
  console.log("TEXT CLASSIFIER TEST (MiniLM Embeddings)");
  console.log("=".repeat(60));
  console.log();

  const embedder = existingEmbedder ?? (await loadEmbedderWithProgress());

  // Extract semantic title
  const embed = async (t: string): Promise<Array<number>> =>
    embedText(embedder, t);
  console.log("Extracting semantic title...");
  const semanticTitle = await extractTitleWithEmbeddings(text, embed);
  console.log(`Semantic Title: ${semanticTitle || "(none found)"}`);
  console.log();

  console.log("Computing label embeddings...");
  const labelEmbeddings = await computeLabelEmbeddings(embedder);
  console.log(`Cached ${labelEmbeddings.length} label embeddings`);
  console.log();

  console.log("Classifying text...");
  const allSuggestions = await generateEmbeddingAndClassify(
    embedder,
    text,
    labelEmbeddings
  );

  console.log();
  printResults(allSuggestions, "MiniLM Embeddings");

  const totalTime = Date.now() - startTime;
  console.log(
    `Processing time: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)`
  );
  console.log();
}

/**
 * Run both methods for comparison
 */
async function runBothMethods(text: string): Promise<void> {
  console.log("=".repeat(60));
  console.log("TEXT CLASSIFIER COMPARISON TEST");
  console.log("=".repeat(60));
  console.log();

  // Extract heuristic title
  console.log("Extracting title (heuristic)...");
  const heuristicTitle = extractTitle(text);
  console.log(`Heuristic Title: ${heuristicTitle || "(none found)"}`);

  // Extract semantic title
  const embedder = await loadEmbedderWithProgress();
  const embed = async (t: string): Promise<Array<number>> =>
    embedText(embedder, t);
  console.log("Extracting title (semantic)...");
  const semanticTitle = await extractTitleWithEmbeddings(text, embed);
  console.log(`Semantic Title:  ${semanticTitle || "(none found)"}`);
  console.log();
  console.log();

  // Run TF-IDF
  await runTfIdfClassification(text);

  console.log();
  console.log();

  // Run Embeddings (reuse already-loaded embedder)
  await runEmbeddingsClassification(text, embedder);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error(
      "Usage: npx tsx lib/text-classifier/cli.ts <text-file-path> [--method=embeddings|tfidf|both]"
    );
    console.error("");
    console.error("Examples:");
    console.error(
      "  npx tsx lib/text-classifier/cli.ts recipe.txt --method=embeddings"
    );
    console.error(
      "  npx tsx lib/text-classifier/cli.ts recipe.txt --method=tfidf"
    );
    console.error(
      "  npx tsx lib/text-classifier/cli.ts recipe.txt --method=both"
    );
    console.error(
      "  npx tsx lib/text-classifier/cli.ts recipe.txt  (defaults to both)"
    );
    process.exit(1);
  }

  const filePath = args[0];
  const methodArg = args.find((arg) => arg.startsWith("--method="));
  const method = methodArg ? methodArg.split("=")[1] : "both";

  if (!["embeddings", "tfidf", "both"].includes(method)) {
    console.error(
      `Error: Invalid method '${method}'. Must be 'embeddings', 'tfidf', or 'both'`
    );
    process.exit(1);
  }

  try {
    const text = readFileSync(filePath, "utf-8");

    if (!text.trim()) {
      console.error(`Error: File '${filePath}' is empty`);
      process.exit(1);
    }

    if (method === "both") {
      await runBothMethods(text);
    } else if (method === "tfidf") {
      console.log("Extracting title...");
      const title = extractTitle(text);
      console.log(`Title: ${title || "(none found)"}`);
      console.log();
      console.log();
      await runTfIdfClassification(text);
    } else {
      // embeddings
      await runEmbeddingsClassification(text);
    }
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

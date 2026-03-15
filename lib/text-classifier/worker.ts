/**
 * Text Classification Web Worker
 * Runs Transformers.js feature extraction with MiniLM embeddings
 */

import { pipeline } from "@huggingface/transformers";
import { classifyWithEmbeddings, type LabelEmbedding } from "./embeddings";
import type { ClassificationCategory } from "./index.d";
import { extractTitleWithEmbeddings } from "./title-extractor";
import {
  ALL_CATEGORY_KEYS,
  ALL_CUISINE_KEYS,
  ALL_SEASON_KEYS,
  CATEGORY_LABELS,
  CUISINE_LABELS,
  SEASON_LABELS,
} from "./labels";

interface ClassificationRequest {
  type: "classify";
  requestId: string;
  text: string;
}

interface ClassificationResponse {
  type: "classification-result";
  requestId: string;
  success: boolean;
  title?: string;
  suggestions?: Array<{
    tag: string;
    confidence: number;
    category: ClassificationCategory;
  }>;
  error?: string;
  processingTimeMs?: number;
}

interface ProgressMessage {
  type: "progress";
  requestId: string;
  phase: string;
  message: string;
}

interface EmbeddingOutput {
  data: Float32Array | Array<number>;
}

interface ModelProgress {
  status?: string;
  loaded?: number;
  total?: number;
}

/**
 * Callable embedder from Transformers.js pipeline.
 * The actual return type of pipeline("feature-extraction", ...) is a complex union;
 * this interface captures the shape we actually use.
 */
interface FeatureEmbedder {
  (
    text: string,
    options: { pooling: "mean"; normalize: true }
  ): Promise<EmbeddingOutput>;
}

async function embedText(
  embedder: FeatureEmbedder,
  text: string
): Promise<Array<number>> {
  const output = await embedder(text, {
    pooling: "mean",
    normalize: true,
  });
  return Array.from(output.data);
}

/**
 * Singleton pattern for lazy model loading and label embeddings caching
 */
class EmbedderSingleton {
  static instance: FeatureEmbedder | null = null;
  static labelEmbeddings: Array<LabelEmbedding> | null = null;

  static async getInstance(
    progressCallback?: (progress: ModelProgress) => void
  ): Promise<FeatureEmbedder> {
    if (!this.instance) {
      console.log("[Classification Worker] Loading MiniLM model...");
      this.instance = (await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2",
        { progress_callback: progressCallback }
      )) as unknown as FeatureEmbedder;
      console.log("[Classification Worker] MiniLM model loaded");
    }
    return this.instance;
  }

  static async getLabelEmbeddings(
    embedder: FeatureEmbedder,
    progressCallback?: (phase: string, message: string) => void
  ): Promise<Array<LabelEmbedding>> {
    if (this.labelEmbeddings) {
      return this.labelEmbeddings;
    }

    console.log("[Classification Worker] Computing label embeddings...");
    progressCallback?.("Computing Embeddings", "Embedding season labels...");

    const embeddings: Array<LabelEmbedding> = [];

    for (const key of ALL_SEASON_KEYS) {
      const description = SEASON_LABELS[key];
      const embedding = await embedText(embedder, description);
      embeddings.push({ key, category: "season", embedding });
    }

    progressCallback?.("Computing Embeddings", "Embedding cuisine labels...");
    for (const key of ALL_CUISINE_KEYS) {
      const description = CUISINE_LABELS[key];
      const embedding = await embedText(embedder, description);
      embeddings.push({ key, category: "cuisine", embedding });
    }

    progressCallback?.(
      "Computing Embeddings",
      "Embedding food category labels..."
    );
    for (const key of ALL_CATEGORY_KEYS) {
      const description = CATEGORY_LABELS[key];
      const embedding = await embedText(embedder, description);
      embeddings.push({ key, category: "food-category", embedding });
    }

    this.labelEmbeddings = embeddings;
    console.log(
      `[Classification Worker] Cached ${embeddings.length} label embeddings`
    );
    return embeddings;
  }
}

/**
 * Generate text embedding and classify
 */
async function generateEmbeddingAndClassify(
  embedder: FeatureEmbedder,
  text: string,
  labelEmbeddings: Array<LabelEmbedding>
): Promise<
  Array<{ tag: string; confidence: number; category: ClassificationCategory }>
> {
  const textEmbedding = await embedText(embedder, text);
  return classifyWithEmbeddings(textEmbedding, labelEmbeddings);
}

/**
 * Run the full classification pipeline
 */
async function runClassification(
  request: ClassificationRequest
): Promise<void> {
  const { requestId, text } = request;
  const startTime = Date.now();

  try {
    console.log("[Classification Worker] Starting classification");

    const embedder = await EmbedderSingleton.getInstance(
      (progress: ModelProgress) => {
        const progressMsg: ProgressMessage = {
          type: "progress",
          requestId,
          phase: "Loading Model",
          message: progress.status || "Loading...",
        };
        self.postMessage(progressMsg);
      }
    );

    const labelEmbeddings = await EmbedderSingleton.getLabelEmbeddings(
      embedder,
      (phase: string, message: string) => {
        const progressMsg: ProgressMessage = {
          type: "progress",
          requestId,
          phase,
          message,
        };
        self.postMessage(progressMsg);
      }
    );

    // Extract title using embeddings
    const embed = async (t: string): Promise<Array<number>> =>
      embedText(embedder, t);
    const title = await extractTitleWithEmbeddings(text, embed);

    const suggestions = await generateEmbeddingAndClassify(
      embedder,
      text,
      labelEmbeddings
    );

    const response: ClassificationResponse = {
      type: "classification-result",
      requestId,
      success: true,
      title,
      suggestions,
      processingTimeMs: Date.now() - startTime,
    };

    self.postMessage(response);
    console.log(
      `[Classification Worker] Classification completed in ${
        Date.now() - startTime
      }ms`
    );
  } catch (error) {
    console.error("[Classification Worker] Classification failed:", error);
    const response: ClassificationResponse = {
      type: "classification-result",
      requestId,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      processingTimeMs: Date.now() - startTime,
    };
    self.postMessage(response);
  }
}

/**
 * Message handler for requests from the main thread
 */
self.addEventListener("message", (event: MessageEvent) => {
  const message = event.data;

  if (message.type === "classify") {
    runClassification(message as ClassificationRequest);
  }
});

// Worker is ready
console.log("[Classification Worker] Worker initialized and ready");

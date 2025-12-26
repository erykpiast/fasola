/**
 * Text Classification Web Worker
 * Runs Transformers.js feature extraction with MiniLM embeddings
 */

import { pipeline } from "@huggingface/transformers";
import type { ClassificationCategory } from "./index.d";
import {
  ALL_CATEGORY_KEYS,
  ALL_CUISINE_KEYS,
  ALL_SEASON_KEYS,
  CATEGORY_LABELS,
  CUISINE_LABELS,
  SEASON_LABELS,
} from "./labels";
import {
  classifyWithEmbeddings,
  type LabelEmbedding,
} from "./embeddings";

interface ClassificationRequest {
  type: "classify";
  requestId: string;
  text: string;
}

interface ClassificationResponse {
  type: "classification-result";
  requestId: string;
  success: boolean;
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

/**
 * Singleton pattern for lazy model loading and label embeddings caching
 */
class EmbedderSingleton {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static instance: any = null;
  static labelEmbeddings: Array<LabelEmbedding> | null = null;

  static async getInstance(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    progressCallback?: (progress: any) => void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    if (!this.instance) {
      console.log("[Classification Worker] Loading MiniLM model...");
      this.instance = await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2",
        { progress_callback: progressCallback }
      );
      console.log("[Classification Worker] MiniLM model loaded");
    }
    return this.instance;
  }

  static async getLabelEmbeddings(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    embedder: any,
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
      const output = (await embedder(description, {
        pooling: "mean",
        normalize: true,
      })) as EmbeddingOutput;
      embeddings.push({
        key,
        category: "season",
        embedding: Array.from(output.data),
      });
    }

    progressCallback?.("Computing Embeddings", "Embedding cuisine labels...");
    for (const key of ALL_CUISINE_KEYS) {
      const description = CUISINE_LABELS[key];
      const output = (await embedder(description, {
        pooling: "mean",
        normalize: true,
      })) as EmbeddingOutput;
      embeddings.push({
        key,
        category: "cuisine",
        embedding: Array.from(output.data),
      });
    }

    progressCallback?.(
      "Computing Embeddings",
      "Embedding food category labels..."
    );
    for (const key of ALL_CATEGORY_KEYS) {
      const description = CATEGORY_LABELS[key];
      const output = (await embedder(description, {
        pooling: "mean",
        normalize: true,
      })) as EmbeddingOutput;
      embeddings.push({
        key,
        category: "food-category",
        embedding: Array.from(output.data),
      });
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  embedder: any,
  text: string,
  labelEmbeddings: Array<LabelEmbedding>
): Promise<
  Array<{ tag: string; confidence: number; category: ClassificationCategory }>
> {
  const output = (await embedder(text, {
    pooling: "mean",
    normalize: true,
  })) as EmbeddingOutput;
  const textEmbedding: Array<number> = Array.from(output.data);

  // Use shared classification function
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (progress: any) => {
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

    const suggestions = await generateEmbeddingAndClassify(
      embedder,
      text,
      labelEmbeddings
    );

    const response: ClassificationResponse = {
      type: "classification-result",
      requestId,
      success: true,
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


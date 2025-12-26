/**
 * Web Text Classifier
 * Supports both MiniLM embeddings (via worker) and TF-IDF
 */

import type {
  ClassificationMethod,
  ClassificationResult,
  TagSuggestion,
} from "./index.d";
import { classifyWithTfIdf } from "./tfidf";
import { extractTitle } from "./title-extractor";

// @ts-expect-error - Metro transformer bundles this as a string
import workerCode from "./worker";

interface ClassificationResponse {
  type: "classification-result";
  requestId: string;
  success: boolean;
  suggestions?: Array<TagSuggestion>;
  error?: string;
  processingTimeMs?: number;
}

interface ProgressMessage {
  type: "progress";
  requestId: string;
  phase: string;
  message: string;
}

let worker: Worker | null = null;
let workerReady = false;
let nextRequestId = 0;

const pendingRequests = new Map<
  string,
  {
    resolve: (result: ClassificationResult) => void;
    reject: (error: Error) => void;
  }
>();

/**
 * Check if Web Workers are supported
 */
function isWorkerSupported(): boolean {
  return typeof Worker !== "undefined" && typeof window !== "undefined";
}

/**
 * Initialize Classification Web Worker
 */
function initializeWorker(): void {
  if (!isWorkerSupported() || worker) {
    return;
  }

  try {
    const blob = new Blob([workerCode as unknown as string], {
      type: "application/javascript",
    });
    const workerUrl = URL.createObjectURL(blob);
    worker = new Worker(workerUrl);

    worker.onmessage = (event: MessageEvent) => {
      const message = event.data;

      if (message.type === "classification-result") {
        const response = message as ClassificationResponse;
        const pending = pendingRequests.get(response.requestId);
        if (pending) {
          pendingRequests.delete(response.requestId);
          if (response.success && response.suggestions) {
            pending.resolve({
              title: undefined, // Title is extracted on main thread
              suggestions: response.suggestions,
              processingTimeMs: response.processingTimeMs || 0,
            });
          } else {
            pending.reject(
              new Error(response.error || "Classification failed")
            );
          }
        }
      } else if (message.type === "progress") {
        const progress = message as ProgressMessage;
        console.log(`[Text Classifier] ${progress.phase}: ${progress.message}`);
      }
    };

    worker.onerror = (error: ErrorEvent) => {
      console.error("[Text Classifier] Worker error:", error);
      worker = null;
      workerReady = false;
    };

    workerReady = true;
    console.log("[Text Classifier] Worker initialized successfully");
  } catch (error) {
    console.warn(
      "[Text Classifier] Failed to initialize worker, classification will not be available:",
      error
    );
    worker = null;
    workerReady = false;
  }
}

/**
 * Classify text using the worker
 */
async function classifyWithWorker(text: string): Promise<ClassificationResult> {
  if (!worker || !workerReady) {
    throw new Error("Worker not initialized");
  }

  const requestId = `req_${nextRequestId++}`;

  return new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });

    worker!.postMessage({
      type: "classify",
      requestId,
      text,
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error("Classification timeout"));
      }
    }, 30000);
  });
}

/**
 * Classify text using TF-IDF scoring
 */
function classifyWithTfIdfMethod(text: string): ClassificationResult {
  const startTime = Date.now();

  try {
    const title = extractTitle(text);
    const allSuggestions = classifyWithTfIdf(text);

    // Filter to top suggestions (max 2 per category with confidence >= 0.3)
    const suggestions: Array<TagSuggestion> = [];
    const counts = { season: 0, cuisine: 0, "food-category": 0 };

    for (const suggestion of allSuggestions) {
      if (counts[suggestion.category] < 2 && suggestion.confidence >= 0.3) {
        suggestions.push(suggestion);
        counts[suggestion.category]++;
      }
    }

    return {
      title,
      suggestions,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error("[Text Classifier] TF-IDF classification failed:", error);
    return {
      title: extractTitle(text),
      suggestions: [],
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Classify text and extract recipe metadata
 */
export async function classifyText(
  text: string,
  method: ClassificationMethod = "embeddings"
): Promise<ClassificationResult> {
  const startTime = Date.now();

  try {
    // Extract title first (synchronous, fast)
    const title = extractTitle(text);

    // Use TF-IDF if requested
    if (method === "tfidf") {
      const result = classifyWithTfIdfMethod(text);
      return { ...result, title };
    }

    // Use embeddings (default)
    // Try to initialize worker if not already done
    if (!worker && !workerReady) {
      initializeWorker();
    }

    // If worker is available, classify
    if (worker && workerReady) {
      const result = await classifyWithWorker(text);
      return {
        title,
        suggestions: result.suggestions,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Worker not available, return title only
    console.warn(
      "[Text Classifier] Worker not available, returning title only"
    );
    return {
      title,
      suggestions: [],
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error("[Text Classifier] Classification failed:", error);
    return {
      title: extractTitle(text),
      suggestions: [],
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Hook to precompute label embeddings (no-op on web, model loads on first use)
 */
export function useLabelEmbeddings(): {
  isReady: boolean;
  error: string | null;
} {
  // On web, we don't precompute - model loads lazily on first classification
  return { isReady: true, error: null };
}

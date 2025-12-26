/**
 * Native Text Classifier
 * Supports both MiniLM embeddings (via TextEmbeddingsModule) and TF-IDF
 */

import {
  ALL_MINILM_L6_V2,
  TextEmbeddingsModule,
} from "react-native-executorch";
import { classifyWithEmbeddings, type LabelEmbedding } from "./embeddings";
import type {
  ClassificationMethod,
  ClassificationResult,
  TagSuggestion,
} from "./index.d";
import {
  ALL_CATEGORY_KEYS,
  ALL_CUISINE_KEYS,
  ALL_SEASON_KEYS,
  CATEGORY_LABELS,
  CUISINE_LABELS,
  SEASON_LABELS,
} from "./labels";
import { classifyWithTfIdf } from "./tfidf";
import { extractTitle } from "./title-extractor";

/**
 * Singleton pattern for model and label embeddings
 */
class EmbeddingsManager {
  private static instance: TextEmbeddingsModule | null = null;
  private static labelEmbeddings: Array<LabelEmbedding> | null = null;
  private static isInitializing = false;

  static async initialize(): Promise<void> {
    if (this.instance && this.labelEmbeddings) {
      return; // Already initialized
    }

    if (this.isInitializing) {
      // Wait for ongoing initialization
      await new Promise((resolve) => setTimeout(resolve, 100));
      return this.initialize();
    }

    this.isInitializing = true;

    try {
      console.log("[Text Classifier] Initializing MiniLM model...");

      // Create and load the model
      this.instance = new TextEmbeddingsModule();
      await this.instance.load({
        modelSource: ALL_MINILM_L6_V2.modelSource,
        tokenizerSource: ALL_MINILM_L6_V2.tokenizerSource,
      });

      console.log("[Text Classifier] Computing label embeddings...");

      // Compute embeddings for all labels
      const embeddings: Array<LabelEmbedding> = [];

      for (const key of ALL_SEASON_KEYS) {
        const description = SEASON_LABELS[key];
        const embeddingRaw = await this.instance.forward(description);
        const embedding = Array.from(embeddingRaw);
        embeddings.push({ key, category: "season", embedding });
      }

      for (const key of ALL_CUISINE_KEYS) {
        const description = CUISINE_LABELS[key];
        const embeddingRaw = await this.instance.forward(description);
        const embedding = Array.from(embeddingRaw);
        embeddings.push({ key, category: "cuisine", embedding });
      }

      for (const key of ALL_CATEGORY_KEYS) {
        const description = CATEGORY_LABELS[key];
        const embeddingRaw = await this.instance.forward(description);
        const embedding = Array.from(embeddingRaw);
        embeddings.push({ key, category: "food-category", embedding });
      }

      this.labelEmbeddings = embeddings;
      console.log(
        `[Text Classifier] Initialized with ${embeddings.length} label embeddings`
      );
    } finally {
      this.isInitializing = false;
    }
  }

  static async classify(text: string): Promise<Array<TagSuggestion>> {
    await this.initialize();

    if (!this.instance || !this.labelEmbeddings) {
      throw new Error("Failed to initialize embeddings");
    }

    // Get text embedding
    const textEmbeddingRaw = await this.instance.forward(text);
    const textEmbedding = Array.from(textEmbeddingRaw);

    // Use shared classification function
    return classifyWithEmbeddings(textEmbedding, this.labelEmbeddings);
  }
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
 * Classify text using embeddings
 */
async function classifyWithEmbeddingsMethod(
  text: string
): Promise<ClassificationResult> {
  const startTime = Date.now();

  try {
    const title = extractTitle(text);
    const allSuggestions = await EmbeddingsManager.classify(text);

    // Sort by confidence
    allSuggestions.sort((a, b) => b.confidence - a.confidence);

    // Filter to top suggestions (max 2 per category)
    const suggestions: Array<TagSuggestion> = [];
    const counts = { season: 0, cuisine: 0, "food-category": 0 };

    for (const suggestion of allSuggestions) {
      if (counts[suggestion.category] < 2) {
        suggestions.push(suggestion);
        counts[suggestion.category]++;
      }
    }

    console.log(
      `[Text Classifier] Found ${suggestions.length} suggestions in ${
        Date.now() - startTime
      }ms`
    );

    return {
      title,
      suggestions,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error("[Text Classifier] Embeddings classification failed:", error);
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
  if (method === "tfidf") {
    return classifyWithTfIdfMethod(text);
  }

  return classifyWithEmbeddingsMethod(text);
}

/**
 * No-op for native platform - no precomputation needed for keyword matching
 */
export function useLabelEmbeddings(): {
  isReady: boolean;
  error: string | null;
} {
  return { isReady: true, error: null };
}

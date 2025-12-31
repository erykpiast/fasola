/**
 * MiniLM Embeddings Text Classification
 * Shared utilities for embedding-based classification across platforms
 */

import type { ClassificationCategory } from "./index.d";

export interface LabelEmbedding {
  key: string;
  category: ClassificationCategory;
  embedding: Array<number>;
}

export interface EmbeddingSuggestion {
  tag: `#${string}`;
  confidence: number;
  category: ClassificationCategory;
}

/**
 * Similarity threshold for embeddings classification
 * Embeddings with similarity >= this value are considered matches
 */
export const SIMILARITY_THRESHOLD = 0.453;

/**
 * Compute cosine similarity between two normalized embeddings
 * Since MiniLM embeddings are normalized, this is just the dot product
 */
export function cosineSimilarity(
  embedding1: Array<number>,
  embedding2: Array<number>
): number {
  let dotProduct = 0;
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
  }
  return dotProduct;
}

/**
 * Classify text using precomputed label embeddings
 */
export function classifyWithEmbeddings(
  textEmbedding: Array<number>,
  labelEmbeddings: Array<LabelEmbedding>
): Array<EmbeddingSuggestion> {
  const suggestions: Array<EmbeddingSuggestion> = [];

  for (const label of labelEmbeddings) {
    const similarity = cosineSimilarity(textEmbedding, label.embedding);

    if (similarity >= SIMILARITY_THRESHOLD) {
      suggestions.push({
        tag: `#${label.key}` as `#${string}`,
        confidence: similarity,
        category: label.category,
      });
    }
  }

  // Sort by confidence (descending)
  suggestions.sort((a, b) => b.confidence - a.confidence);

  return suggestions;
}

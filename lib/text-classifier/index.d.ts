/**
 * Text Classifier Types
 * Shared types for platform-specific text classification implementations
 */

/**
 * Classification category type
 */
export type ClassificationCategory = "season" | "cuisine" | "food-category";

/**
 * Classification method type
 */
export type ClassificationMethod = "embeddings" | "tfidf";

/**
 * Tag suggestion with confidence score
 */
export interface TagSuggestion {
  tag: `#${string}`;
  confidence: number;
  category: ClassificationCategory;
}

/**
 * Result from text classification
 */
export interface ClassificationResult {
  title?: string;
  suggestions: Array<TagSuggestion>;
  processingTimeMs: number;
}

/**
 * Classify text and extract recipe metadata
 * @param text - Extracted OCR text
 * @param method - Classification method (default: embeddings)
 * @returns Classification result with title and tag suggestions
 */
export function classifyText(
  text: string,
  method?: ClassificationMethod
): Promise<ClassificationResult>;




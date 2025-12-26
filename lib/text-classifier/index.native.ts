/**
 * Native Text Classifier using react-native-executorch
 * Uses text embeddings and cosine similarity for classification
 *
 * NOTE: On native, classification uses a simpler keyword matching approach
 * since we cannot use react-native-executorch's useTextEmbeddings hook
 * outside of React components. For production, consider:
 * 1. Moving to a server-side classification API
 * 2. Using a different on-device ML library with imperative API
 * 3. Pre-training a simpler model specifically for this task
 */

import type { ClassificationResult, TagSuggestion } from "./index.d";
import {
  ALL_CATEGORY_KEYS,
  ALL_CUISINE_KEYS,
  ALL_SEASON_KEYS,
  CATEGORY_LABELS,
  CUISINE_LABELS,
  SEASON_LABELS,
} from "./labels";
import { extractTitle } from "./title-extractor";

/**
 * Simple keyword-based classification for native platform
 * Uses label descriptions to find matching keywords in text
 */
function classifyByKeywords(
  text: string,
  labels: Record<string, string>,
  category: "season" | "cuisine" | "food-category"
): Array<TagSuggestion> {
  const lowerText = text.toLowerCase();
  const suggestions: Array<TagSuggestion> = [];

  for (const [label, description] of Object.entries(labels)) {
    const keywords = description.toLowerCase().split(/[,\s]+/);
    let matchCount = 0;

    for (const keyword of keywords) {
      if (keyword.length > 3 && lowerText.includes(keyword)) {
        matchCount++;
      }
    }

    // Calculate simple confidence based on keyword matches
    const confidence = Math.min(matchCount / keywords.length, 1.0);

    // Only include if we have reasonable confidence (>= 0.4)
    if (confidence >= 0.4) {
      suggestions.push({
        tag: `#${label}` as `#${string}`,
        confidence,
        category,
      });
    }
  }

  return suggestions;
}

/**
 * Classify text using keyword matching
 * This is a fallback implementation for native platform
 */
export async function classifyText(text: string): Promise<ClassificationResult> {
  const startTime = Date.now();

  try {
    // Extract title first
    const title = extractTitle(text);

    // Classify using keyword matching
    const seasonSuggestions = classifyByKeywords(
      text,
      SEASON_LABELS,
      "season"
    );
    const cuisineSuggestions = classifyByKeywords(
      text,
      CUISINE_LABELS,
      "cuisine"
    );
    const categorySuggestions = classifyByKeywords(
      text,
      CATEGORY_LABELS,
      "food-category"
    );

    // Combine all suggestions
    const allSuggestions = [
      ...seasonSuggestions,
      ...cuisineSuggestions,
      ...categorySuggestions,
    ];

    // Sort by confidence
    allSuggestions.sort((a, b) => b.confidence - a.confidence);

    // Filter to top suggestions (max 2 per category with confidence >= 0.6)
    const suggestions: Array<TagSuggestion> = [];
    const counts = { season: 0, cuisine: 0, "food-category": 0 };

    for (const suggestion of allSuggestions) {
      if (counts[suggestion.category] < 2 && suggestion.confidence >= 0.6) {
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
    console.error("[Text Classifier] Classification failed:", error);
    return {
      title: extractTitle(text),
      suggestions: [],
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * No-op for native platform - no precomputation needed for keyword matching
 */
export function useLabelEmbeddings(): { isReady: boolean; error: string | null } {
  return { isReady: true, error: null };
}


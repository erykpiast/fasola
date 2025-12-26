/**
 * TF-IDF (Term Frequency-Inverse Document Frequency) Text Classification
 * Weights distinctive keywords higher than common ones for better classification
 */

import type { ClassificationCategory } from "./index.d";
import {
  ALL_CATEGORY_KEYS,
  ALL_CUISINE_KEYS,
  ALL_SEASON_KEYS,
  CATEGORY_LABELS,
  CUISINE_LABELS,
  SEASON_LABELS,
} from "./labels";

interface LabelInfo {
  key: string;
  category: ClassificationCategory;
  keywords: Array<string>;
}

/**
 * Precomputed IDF scores for all keywords across all labels
 */
let idfScores: Map<string, number> | null = null;
let allLabels: Array<LabelInfo> | null = null;

/**
 * Initialize IDF scores by computing how rare each keyword is across all labels
 */
function initializeIdfScores(): void {
  if (idfScores && allLabels) {
    return; // Already initialized
  }

  // Collect all labels with their keywords
  const labels: Array<LabelInfo> = [];

  for (const key of ALL_SEASON_KEYS) {
    const description = SEASON_LABELS[key];
    const keywords = description
      .toLowerCase()
      .split(/[,\s]+/)
      .filter((k) => k.length > 3);
    labels.push({ key, category: "season", keywords });
  }

  for (const key of ALL_CUISINE_KEYS) {
    const description = CUISINE_LABELS[key];
    const keywords = description
      .toLowerCase()
      .split(/[,\s]+/)
      .filter((k) => k.length > 3);
    labels.push({ key, category: "cuisine", keywords });
  }

  for (const key of ALL_CATEGORY_KEYS) {
    const description = CATEGORY_LABELS[key];
    const keywords = description
      .toLowerCase()
      .split(/[,\s]+/)
      .filter((k) => k.length > 3);
    labels.push({ key, category: "food-category", keywords });
  }

  allLabels = labels;

  // Count how many labels each keyword appears in
  const keywordLabelCounts = new Map<string, number>();

  for (const label of labels) {
    const uniqueKeywords = new Set(label.keywords);
    for (const keyword of uniqueKeywords) {
      keywordLabelCounts.set(
        keyword,
        (keywordLabelCounts.get(keyword) || 0) + 1
      );
    }
  }

  // Compute IDF scores: IDF(keyword) = log(totalLabels / labelsContainingKeyword)
  const totalLabels = labels.length;
  idfScores = new Map<string, number>();

  for (const [keyword, count] of keywordLabelCounts) {
    const idf = Math.log(totalLabels / count);
    idfScores.set(keyword, idf);
  }

  console.log(
    `[TF-IDF] Initialized IDF scores for ${idfScores.size} unique keywords across ${totalLabels} labels`
  );
}

/**
 * Compute TF (term frequency) for keywords in text
 */
function computeTermFrequency(text: string): Map<string, number> {
  const lowerText = text.toLowerCase();
  const words = lowerText.split(/[,\s]+/).filter((w) => w.length > 3);

  const termFreq = new Map<string, number>();
  for (const word of words) {
    termFreq.set(word, (termFreq.get(word) || 0) + 1);
  }

  return termFreq;
}

/**
 * Compute TF-IDF score for a label against the input text
 */
function computeLabelScore(
  textTermFreq: Map<string, number>,
  label: LabelInfo,
  idf: Map<string, number>
): number {
  let score = 0;
  let normalization = 0;

  for (const keyword of label.keywords) {
    const idfScore = idf.get(keyword) || 0;
    const tf = textTermFreq.get(keyword) || 0;

    if (tf > 0) {
      score += tf * idfScore;
    }

    // Normalization: sum of IDF scores for all keywords in the label
    normalization += idfScore;
  }

  // Normalize by the sum of IDF scores to handle labels with different keyword counts
  return normalization > 0 ? score / normalization : 0;
}

export interface TfIdfSuggestion {
  tag: `#${string}`;
  confidence: number;
  category: ClassificationCategory;
}

/**
 * Classify text using TF-IDF scoring
 */
export function classifyWithTfIdf(text: string): Array<TfIdfSuggestion> {
  // Initialize on first use
  initializeIdfScores();

  if (!idfScores || !allLabels) {
    console.error("[TF-IDF] Failed to initialize IDF scores");
    return [];
  }

  // Compute term frequency for input text
  const textTermFreq = computeTermFrequency(text);

  // Compute scores for all labels
  const suggestions: Array<TfIdfSuggestion> = [];

  for (const label of allLabels) {
    const score = computeLabelScore(textTermFreq, label, idfScores);

    // Only include if we have reasonable confidence
    // TF-IDF scores are typically lower than simple keyword matching
    // because they're normalized and weighted
    if (score > 0.2) {
      suggestions.push({
        tag: `#${label.key}` as `#${string}`,
        confidence: score,
        category: label.category,
      });
    }
  }

  // Sort by confidence
  suggestions.sort((a, b) => b.confidence - a.confidence);

  return suggestions;
}

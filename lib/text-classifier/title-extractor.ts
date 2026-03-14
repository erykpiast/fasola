/**
 * Title Extraction
 * Extracts potential recipe title from OCR text using heuristics or semantic embeddings
 */

import { cosineSimilarity } from "./embeddings";

export type EmbedFn = (text: string) => Promise<Array<number>>;

const TITLE_REFERENCE =
  "recipe name, dish title, name of the food, nazwa przepisu, nazwa dania";
const HEADER_REFERENCE =
  "ingredients list, cooking directions, section heading, składniki, przygotowanie, sposób wykonania";
const NOISE_REFERENCE =
  "page number, table of contents, book footer, garbled text";

/**
 * Measurement units commonly found in ingredient lists
 */
const MEASUREMENT_PATTERNS = [
  "cup",
  "cups",
  "tbsp",
  "tsp",
  "tablespoon",
  "teaspoon",
  "oz",
  "lb",
  "gram",
  "grams",
  "kg",
  "ml",
  "liter",
  "pinch",
  "dash",
  "handful",
];

function looksLikeIngredient(line: string): boolean {
  const lowerLine = line.toLowerCase();
  return MEASUREMENT_PATTERNS.some((pattern) => lowerLine.includes(pattern));
}

function startsWithNumber(line: string): boolean {
  return /^\s*\d/.test(line);
}

function isAllCaps(line: string): boolean {
  const letters = line.replace(/[^a-zA-Z]/g, "");
  return letters.length > 0 && letters === letters.toUpperCase();
}

function passesHardFilters(text: string): boolean {
  if (text.length < 3 || text.length > 80) return false;
  if (looksLikeIngredient(text)) return false;
  if (startsWithNumber(text)) return false;
  return true;
}

/**
 * Detect initial burst of short/garbled lines (< 20 chars).
 * Returns the index of the first line >= 20 chars.
 */
function findBurstEnd(lines: Array<{ text: string }>): number {
  let i = 0;
  while (i < lines.length && lines[i].text.length < 20) {
    i++;
  }
  // No long line found — no burst to detect
  if (i >= lines.length) return 0;
  // Need at least 3 consecutive short lines to count as a real burst
  if (i < 3) return 0;
  return i;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * Build candidate strings from lines: single lines plus multi-line joins (2-3 consecutive).
 * Skips initial burst of short lines. Scans all remaining lines. Caps at 25.
 */
function buildCandidates(
  lines: Array<string>
): Array<{ text: string; position: number }> {
  const nonEmptyLines: Array<{ text: string; index: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length > 0) {
      nonEmptyLines.push({ text: trimmed, index: i });
    }
  }

  const burstEnd = findBurstEnd(nonEmptyLines);
  const candidates: Array<{ text: string; position: number }> = [];
  const seen = new Set<string>();

  for (let i = burstEnd; i < nonEmptyLines.length; i++) {
    const line = nonEmptyLines[i];

    // Single line
    if (passesHardFilters(line.text)) {
      const norm = line.text.toLowerCase();
      if (!seen.has(norm)) {
        seen.add(norm);
        candidates.push({ text: line.text, position: line.index });
      }
    }

    // 2-line join
    if (i + 1 < nonEmptyLines.length) {
      const joined2 = `${line.text} ${nonEmptyLines[i + 1].text}`;
      if (passesHardFilters(joined2)) {
        const norm = joined2.toLowerCase();
        if (!seen.has(norm)) {
          seen.add(norm);
          candidates.push({ text: joined2, position: line.index });
        }
      }
    }

    // 3-line join
    if (i + 2 < nonEmptyLines.length) {
      const joined3 = `${line.text} ${nonEmptyLines[i + 1].text} ${nonEmptyLines[i + 2].text}`;
      if (passesHardFilters(joined3)) {
        const norm = joined3.toLowerCase();
        if (!seen.has(norm)) {
          seen.add(norm);
          candidates.push({ text: joined3, position: line.index });
        }
      }
    }
  }

  // If more than 25, prioritize ALL_CAPS and short lines
  if (candidates.length > 25) {
    const prioritized = candidates.slice().sort((a, b) => {
      const aAllCaps = isAllCaps(a.text) ? 0 : 1;
      const bAllCaps = isAllCaps(b.text) ? 0 : 1;
      if (aAllCaps !== bAllCaps) return aAllCaps - bAllCaps;
      const aShort = wordCount(a.text) <= 5 ? 0 : 1;
      const bShort = wordCount(b.text) <= 5 ? 0 : 1;
      return aShort - bShort;
    });
    return prioritized.slice(0, 25);
  }

  return candidates;
}

// Module-level cache for reference embeddings
let cachedTitleRefEmbedding: Array<number> | null = null;
let cachedHeaderRefEmbedding: Array<number> | null = null;
let cachedNoiseRefEmbedding: Array<number> | null = null;

export function _resetEmbeddingCacheForTests(): void {
  cachedTitleRefEmbedding = null;
  cachedHeaderRefEmbedding = null;
  cachedNoiseRefEmbedding = null;
}

export async function extractTitleWithEmbeddings(
  text: string,
  embed: EmbedFn
): Promise<string | undefined> {
  if (!text || text.trim().length === 0) {
    return undefined;
  }

  const lines = text.split("\n");
  const candidates = buildCandidates(lines);

  if (candidates.length === 0) {
    return undefined;
  }

  // Cache reference embeddings
  if (!cachedTitleRefEmbedding) {
    cachedTitleRefEmbedding = await embed(TITLE_REFERENCE);
  }
  if (!cachedHeaderRefEmbedding) {
    cachedHeaderRefEmbedding = await embed(HEADER_REFERENCE);
  }
  if (!cachedNoiseRefEmbedding) {
    cachedNoiseRefEmbedding = await embed(NOISE_REFERENCE);
  }

  const scored: Array<{ text: string; position: number; score: number }> = [];

  for (const candidate of candidates) {
    const embedding = await embed(candidate.text);
    const titleSim = cosineSimilarity(embedding, cachedTitleRefEmbedding);
    const headerSim = cosineSimilarity(embedding, cachedHeaderRefEmbedding);
    const noiseSim = cosineSimilarity(embedding, cachedNoiseRefEmbedding);
    const score = titleSim - Math.max(headerSim, noiseSim);

    scored.push({ text: candidate.text, position: candidate.position, score });
  }

  if (scored.length === 0) {
    return undefined;
  }

  const bestScore = Math.max(...scored.map((s) => s.score));
  const threshold = Math.max(0.05, bestScore * 0.6);

  // Filter candidates above threshold
  let selected = scored.filter((s) => s.score >= threshold);

  // Deduplicate: if one title is a substring of another, keep the shorter (more focused) one
  selected = selected.filter((a) => {
    const aLower = a.text.toLowerCase();
    return !selected.some(
      (b) =>
        b !== a &&
        aLower.includes(b.text.toLowerCase()) &&
        b.text.length < a.text.length
    );
  });

  // Cap at 3, sort by document position
  selected.sort((a, b) => a.position - b.position);
  selected = selected.slice(0, 3);

  if (selected.length === 0) {
    return undefined;
  }

  return selected.map((s) => s.text).join(" + ");
}

/**
 * Extract potential recipe title from OCR text (sync heuristic fallback)
 */
export function extractTitle(text: string): string | undefined {
  if (!text || text.trim().length === 0) {
    return undefined;
  }

  const lines = text.split("\n").map((line) => line.trim());

  for (const line of lines) {
    if (line.length === 0) continue;
    if (line.length < 3 || line.length > 50) continue;
    if (looksLikeIngredient(line)) continue;
    if (isAllCaps(line)) continue;
    if (startsWithNumber(line)) continue;
    return line;
  }

  return undefined;
}

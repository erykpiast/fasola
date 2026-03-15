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
  // English
  "cup",
  "cups",
  "tbsp",
  "tsp",
  "tablespoon",
  "teaspoon",
  // "oz" and "lb" are matched with word boundaries in looksLikeIngredient
  // to avoid false positives ("oz" in "mozzarella", "lb" in "albacore")
  "gram",
  "grams",
  "kg",
  "ml",
  "liter",
  "pinch",
  "dash",
  "handful",
  // Polish
  "łyżka", "łyżki", "łyżek",           // tablespoon(s)
  "łyżeczka", "łyżeczki", "łyżeczek",   // teaspoon(s)
  "szklanka", "szklanki", "szklanek",    // cup(s)
  "szczypta",                            // pinch
  "garść",                               // handful
  "opakowanie", "opakowania",            // package(s)
  "plasterek", "plasterki",             // slice(s)
];

/**
 * Patterns that identify recipe metadata lines (not titles)
 */
const METADATA_PATTERNS = [
  /^(SERVES?|MAKES?|YIELDS?)\b/i,
  /^(PREP(ARATION)?|COOK(ING)?|PROOF|RISING|FERMENTATION|REST(ING)?)\s*(AND\s*)?(COOK(ING)?)?\s*TIME/i,
  /^SAMPLE\s+SCHEDULE\b/i,
  /^BULK\s+FERMENTATION\b/i,
  /^(THIS\s+RECIPE\s+)?MAKES\b/i,
  // Polish serving-size patterns: "NA 3 PAPRYKI", "NA OKOŁO 1 KG", "DLA 4 OSÓB"
  /^NA\s+(\d|OKOŁO)\b/i,
  /^DLA\s+\d/i,
  // OCR-resilient: "DLA" + any token + serving-unit word (handles DLA & OSOB, DLA § OSOB, etc.)
  /^DLA\s+\S+\s+OSOB/i,
  // OCR-resilient: "DLA" + single non-alphanumeric char (common digit→symbol OCR error)
  /^DLA\s+[^a-zA-Z0-9\s]\s/i,
  // Time-unit metadata: any line containing "N MIN" or "N GODZ" is prep/cook/rest time,
  // regardless of OCR-corrupted prefix (catches PRZYGOTOWANTE, GOTOMANTE, etc.)
  /\b\d+\s*MIN\b/i,
  /\b\d+\s*GODZ/i,
];

/**
 * Single-word non-title words — standalone OCR fragments unlikely to be recipe titles
 */
const NON_TITLE_WORDS = new Set([
  "the", "and", "for", "but", "not", "you", "all", "can", "are", "was",
  "has", "his", "her", "its", "our", "who", "how", "may", "new", "now",
  "old", "see", "way", "did", "get", "let", "say", "she", "too", "use",
  "buns", "with",
]);

function looksLikeIngredient(line: string): boolean {
  const lowerLine = line.toLowerCase();
  if (MEASUREMENT_PATTERNS.some((pattern) => lowerLine.includes(pattern))) return true;
  // Compact metric: "100g", "50ml", "250g" — digit immediately followed by g/ml/kg
  if (/\b\d+\s*(?:g|ml|kg)\b/i.test(line)) return true;
  // "to taste" / "do smaku" — qualitative ingredient with no unit
  if (/\bto taste\b/i.test(line) || /\bdo smaku\b/i.test(line)) return true;
  return false;
}

function startsWithNumber(line: string): boolean {
  // Match lines starting with a digit, or bullet-then-digit (e.g., "- 2 jajka")
  return /^\s*(?:[-•*]\s*)?\d/.test(line);
}

function stripDiacritics(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Known recipe section labels — these are structural headers, not recipe titles.
 * Matched case-insensitively after trimming, stripping trailing punctuation, and stripping diacritics.
 * Polish entries are stored without diacritics for OCR resilience (e.g. "SKLADNIKI" matches "składniki").
 */
const SECTION_LABELS = new Set([
  // English
  "ingredients", "directions", "instructions", "method", "preparation",
  "steps", "notes", "tip", "tips", "variations", "variation",
  "garnish", "topping", "toppings", "frosting", "filling",
  // Polish (stored without diacritics for OCR resilience)
  "skladniki", "przygotowanie", "sposob przygotowania", "sposob wykonania",
  "wykonanie", "wskazowki", "podpowiedz", "warianty",
  "sos", "nadzienie", "polewa", "lukier", "ciasto",
]);

function isSectionLabel(text: string): boolean {
  const normalized = stripDiacritics(text.trim().replace(/[:.]$/, "").toLowerCase());
  return SECTION_LABELS.has(normalized);
}

function isAllCaps(line: string): boolean {
  const letters = line.replace(/[^a-zA-Z]/g, "");
  return letters.length > 0 && letters === letters.toUpperCase();
}

function looksLikeMetadata(text: string): boolean {
  return METADATA_PATTERNS.some((pattern) => pattern.test(text.trim()));
}

function isLikelyGarbled(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 2) return true;

  // Check vowel ratio — English/Polish text typically has 30–50% vowels
  const vowels = letters.replace(/[^aeiouAEIOUyYąęóĄĘÓ]/g, "").length;
  const vowelRatio = vowels / letters.length;
  if (vowelRatio < 0.15 || vowelRatio > 0.85) return true;

  // Single orphaned word ≤3 letters that isn't a common word
  const words = text.trim().split(/\s+/);
  const COMMON_SHORT = new Set([
    "the", "and", "for", "but", "not", "you", "all", "can", "had", "her",
    "was", "one", "our", "out", "are", "has", "his", "how", "its", "may",
    "new", "now", "old", "see", "way", "who", "did", "get", "let", "say",
    "she", "too", "use",
  ]);
  if (words.length === 1 && letters.length <= 3 && !COMMON_SHORT.has(text.trim().toLowerCase())) {
    return true;
  }

  // Single word with internal lowercase→uppercase transition — OCR noise (e.g., "UuIw", "aBC")
  // No recipe title uses this pattern as a standalone single-word candidate.
  if (words.length === 1 && /[a-z][A-Z]/.test(text.trim())) {
    return true;
  }

  // Recipe titles never start with a lowercase letter
  if (/^[a-z]/.test(text.trim())) {
    return true;
  }

  // Mid-text sentence boundary (". " followed by a letter) — body text fragment spliced from multiple sentences
  const trimmed = text.trim();
  if (/\.\s+[a-zA-Z]/.test(trimmed) && !trimmed.endsWith(")")) {
    return true;
  }

  // Multi-word candidate containing a garbled OCR fragment: a short lowercase word that isn't a known short word
  if (words.length >= 2) {
    const commonShort2 = new Set([
      "a", "i", "of", "or", "to", "in", "on", "is", "it", "an",
      "as", "at", "by", "do", "go", "if", "no", "so", "up", "we",
      "w", "z",  // Polish prepositions
    ]);
    const hasGarbledWord = words.some(
      (w) =>
        /^[a-z]/.test(w) &&
        w.replace(/[^a-z]/g, "").length <= 2 &&
        !commonShort2.has(w.toLowerCase())
    );
    if (hasGarbledWord) {
      return true;
    }
  }

  return false;
}

function passesHardFilters(text: string): boolean {
  if (text.length < 3 || text.length > 80) return false;
  if (looksLikeIngredient(text)) return false;
  if (startsWithNumber(text)) return false;
  if (looksLikeMetadata(text)) return false;
  if (isLikelyGarbled(text)) return false;
  // Pipe-separated lines are book category/chapter headers, not recipe titles
  if (text.includes(" | ")) return false;
  // Slash-separated breadcrumbs (e.g., "/ Jesien / Zupy") are navigation, not titles
  // Only filter when 2+ slashes are present — single-slash lines like
  // "TITLE / SUBTITLE" are legitimate continuation-merged titles
  if ((text.match(/\//g) || []).length >= 2) return false;
  // Bullet-list items (ingredients or instruction steps) are never titles
  if (/^\s*[-•*]\s/.test(text)) return false;
  // Known recipe section labels are structural headers, not titles
  if (isSectionLabel(text)) return false;
  // Single-word non-title fragments
  const words = text.trim().split(/\s+/);
  if (words.length === 1 && NON_TITLE_WORDS.has(text.trim().toLowerCase())) return false;
  return true;
}

/**
 * Detect initial burst of short garbled lines.
 * Returns the index of the first non-garbled or long line.
 */
function findBurstEnd(lines: Array<{ text: string }>): number {
  let i = 0;
  while (i < lines.length && lines[i].text.length < 20 && isLikelyGarbled(lines[i].text)) {
    i++;
  }
  return i;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * Build candidate strings from lines: single lines plus multi-line joins (2-3 consecutive).
 * Skips initial burst of short garbled lines. Scans all remaining lines. Caps at 25.
 */
export type CandidateOrigin = "single" | "2-line" | "3-line";

function buildCandidates(
  lines: Array<string>
): Array<{ text: string; position: number; origin: CandidateOrigin }> {
  const nonEmptyLines: Array<{ text: string; index: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length > 0) {
      nonEmptyLines.push({ text: trimmed, index: i });
    }
  }

  const burstEnd = findBurstEnd(nonEmptyLines);

  // Pre-merge consecutive short ALL_CAPS lines (OCR-fragmented headings).
  // When a sequence of 2+ ALL_CAPS lines each has ≤2 words and ≤25 chars, they are
  // almost certainly OCR fragments of a single heading. Merge them into one line so
  // the complete title enters the candidate pool without hitting the 3-line join ceiling.
  const capsCoalesced: Array<{ text: string; index: number }> = [];
  let ci = burstEnd;
  while (ci < nonEmptyLines.length) {
    const line = nonEmptyLines[ci];
    if (
      isAllCaps(line.text) &&
      wordCount(line.text) <= 2 &&
      line.text.length <= 25 &&
      !isSectionLabel(line.text) &&
      !looksLikeMetadata(line.text)
    ) {
      let merged = line.text;
      const startIndex = line.index;
      let j = ci + 1;
      while (j < nonEmptyLines.length) {
        const next = nonEmptyLines[j];
        if (
          isAllCaps(next.text) &&
          wordCount(next.text) <= 2 &&
          next.text.length <= 25 &&
          !isSectionLabel(next.text) &&
          !looksLikeMetadata(next.text) &&
          (merged + " " + next.text).length <= 80
        ) {
          merged += " " + next.text;
          j++;
        } else {
          break;
        }
      }
      if (j > ci + 1) {
        capsCoalesced.push({ text: merged, index: startIndex });
        ci = j;
        continue;
      }
    }
    capsCoalesced.push(line);
    ci++;
  }

  // Pre-merge continuation lines: a line starting with /&+:( is never a standalone title.
  // Merge it into the preceding line so the complete title enters the pool as a single candidate,
  // avoiding the fragile chain of conditions required by the downstream join survival logic.
  // Limitation: only one continuation line per preceding line is merged. Titles split across
  // three or more lines with continuation tokens (rare in practice) are not handled here —
  // the downstream 2-line and 3-line join candidates cover those cases instead.
  const mergedLines: Array<{ text: string; index: number }> = [];
  for (let i = 0; i < capsCoalesced.length; i++) {
    const line = capsCoalesced[i];
    if (i + 1 < capsCoalesced.length) {
      const nextText = capsCoalesced[i + 1].text;
      if (/^[/&+:(]/.test(nextText)) {
        mergedLines.push({ text: `${line.text} ${nextText}`, index: line.index });
        i++;
        continue;
      }
    }
    mergedLines.push(line);
  }

  const candidates: Array<{ text: string; position: number; origin: CandidateOrigin }> = [];
  const seen = new Set<string>();

  // Build a set of positions to skip: short ALL_CAPS lines immediately following metadata
  const metadataContinuationPositions = new Set<number>();
  for (let i = 0; i < mergedLines.length - 1; i++) {
    if (looksLikeMetadata(mergedLines[i].text)) {
      const next = mergedLines[i + 1];
      if (isAllCaps(next.text) && wordCount(next.text) <= 2 && next.text.length <= 15) {
        metadataContinuationPositions.add(next.index);
      }
    }
  }

  for (let i = 0; i < mergedLines.length; i++) {
    const line = mergedLines[i];

    // Skip metadata continuation fragments
    if (metadataContinuationPositions.has(line.index)) continue;

    // Single line
    if (passesHardFilters(line.text)) {
      const norm = line.text.toLowerCase();
      if (!seen.has(norm)) {
        seen.add(norm);
        candidates.push({ text: line.text, position: line.index, origin: "single" });
      }
    }

    // 2-line join — skip if first line is a section label (prevents "INGREDIENTS TITLE" joins)
    if (i + 1 < mergedLines.length && !isSectionLabel(line.text)) {
      const joined2 = `${line.text} ${mergedLines[i + 1].text}`;
      if (passesHardFilters(joined2)) {
        const norm = joined2.toLowerCase();
        if (!seen.has(norm)) {
          seen.add(norm);
          candidates.push({ text: joined2, position: line.index, origin: "2-line" });
        }
      }
    }

    // 3-line join — skip if first line is a section label
    if (i + 2 < mergedLines.length && !isSectionLabel(line.text)) {
      const joined3 = `${line.text} ${mergedLines[i + 1].text} ${mergedLines[i + 2].text}`;
      if (passesHardFilters(joined3)) {
        const norm = joined3.toLowerCase();
        if (!seen.has(norm)) {
          seen.add(norm);
          candidates.push({ text: joined3, position: line.index, origin: "3-line" });
        }
      }
    }
  }

  // Pre-filter to 25 before embedding calls: prefer ALL_CAPS and short candidates.
  // Position-based scoring handles final ranking.
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

  // Find ALL_CAPS candidates with ≥2 words where every significant word has ≥4 alpha letters.
  // Insignificant tokens (≤1 alpha letter: "/", "&", "+", ":", "D)", etc.) are filtered before
  // the check so that multi-line joins with continuation punctuation still qualify.
  const isStructuralHeading = (c: { text: string }): boolean => {
    if (!isAllCaps(c.text) || wordCount(c.text) < 2) return false;
    const sigWords = c.text.trim().split(/\s+/).filter((w) => w.replace(/[^A-Z]/g, "").length > 1);
    return sigWords.length >= 2 && sigWords.every((w) => w.replace(/[^A-Z]/g, "").length >= 4);
  };

  // Pass 1: compute rawScore for all candidates (embedding quality signal)
  const rawScored: Array<{ text: string; position: number; origin: CandidateOrigin; rawScore: number; embedding: Array<number> }> = [];
  for (const candidate of candidates) {
    const embedding = await embed(candidate.text);
    const titleSim = cosineSimilarity(embedding, cachedTitleRefEmbedding);
    const headerSim = cosineSimilarity(embedding, cachedHeaderRefEmbedding);
    const noiseSim = cosineSimilarity(embedding, cachedNoiseRefEmbedding);
    const rawScore = titleSim - Math.max(headerSim, noiseSim);
    rawScored.push({ text: candidate.text, position: candidate.position, origin: candidate.origin, rawScore, embedding });
  }

  // Select baseHeading by embedding quality (rawScore), not position.
  // This prevents OCR-garbled fragments from claiming the structural heading slot.
  const structuralCandidates = rawScored.filter((s) => isStructuralHeading(s));

  // Penalize structural headings with truncated OCR words:
  // if "FRON" appears and another heading has "SAFFRON", "FRON" is likely garbled.
  for (const sc of structuralCandidates) {
    const sigWords = sc.text.split(/\s+/).filter((w) => w.replace(/[^A-Z]/g, "").length >= 4);
    for (const other of structuralCandidates) {
      if (other === sc) continue;
      const otherSigWords = other.text.split(/\s+/).filter((w) => w.replace(/[^A-Z]/g, "").length >= 4);
      const hasTruncation = sigWords.some((w) =>
        otherSigWords.some((ow) => ow !== w && ow.length > w.length && ow.endsWith(w))
      );
      if (hasTruncation) {
        sc.rawScore = -1.0;  // Hard disqualification — truncated OCR artifact
        break;
      }
    }
  }

  const bestStructural = structuralCandidates.length > 0
    ? structuralCandidates.reduce((a, b) => {
        const scoreDiff = a.rawScore - b.rawScore;
        if (Math.abs(scoreDiff) > 0.03) return scoreDiff > 0 ? a : b;
        // Tiebreak: single-line origin beats multi-line joins (avoids conflating two separate headings)
        if (a.origin === "single" && b.origin !== "single") return a;
        if (b.origin === "single" && a.origin !== "single") return b;
        // Tiebreak: more words (more specific) → better
        const wcDiff = wordCount(b.text) - wordCount(a.text);
        if (wcDiff !== 0) return wcDiff > 0 ? b : a;
        // Tiebreak: earlier position → better
        return a.position < b.position ? a : b;
      })
    : null;
  const baseHeading = bestStructural ?? undefined;

  // When the best structural heading has a continuation on the next line introduced by a
  // punctuation token (/, &, +, :, or parenthesis), prefer the longer 2-line join as the
  // complete heading. E.g. "SAFFRON WHEAT BUNS WITH QUARK" + "/ COTTAGE CHEESE (VARIATION D)".
  // Guard: the remainder after the prefix must start with a continuation character to avoid
  // merging two separate consecutive recipe titles (FINNISH MILK FLATBREADS stays separate
  // from FINNISH POTATO FLATBREADS because "FINNISH" does not start with a continuation token).
  let firstStructuralHeading = baseHeading && (
    rawScored.find((c) => {
      if (!isStructuralHeading(c)) return false;
      const hLower = baseHeading.text.toLowerCase();
      const cLower = c.text.toLowerCase();
      return cLower.startsWith(hLower + " ") && /^[/&+:(]/.test(cLower.slice(hLower.length + 1));
    }) ?? baseHeading
  );

  // Pass 2: apply bonuses
  const scored: Array<{ text: string; position: number; origin: CandidateOrigin; score: number; rawScore: number; baseScore: number; thresholdScore: number }> = rawScored.map((rs) => {
    // Position factor: multiplicative tiebreaker — amplifies existing signal, doesn't replace it
    const relativePosition = rs.position / lines.length;
    const positionFactor = relativePosition < 0.5
      ? 1.0 + 0.12 * (1 - relativePosition * 2)
      : 1.0;

    // ALL_CAPS bonus: recipe books use ALL_CAPS for titles and section headings
    const allCapsBonus = isAllCaps(rs.text) && rs.text.replace(/[^a-zA-Z]/g, "").length >= 4
      ? 0.08
      : 0;

    // Structural heading bonus: best ALL_CAPS heading (or its continuation join) is almost always the recipe title
    const structuralBonus = firstStructuralHeading && rs.text === firstStructuralHeading.text ? 0.10 : 0;

    // thresholdScore excludes structural bonus so the bonus doesn't inflate the threshold
    // and prevent equally-valid structural headings from passing on multi-recipe pages.
    const thresholdScore = rs.rawScore + allCapsBonus;
    // baseScore excludes position factor — used for diagnostics and ranking
    const baseScore = rs.rawScore + allCapsBonus + structuralBonus;
    const score = rs.rawScore * positionFactor + allCapsBonus + structuralBonus;
    return { text: rs.text, position: rs.position, origin: rs.origin, score, rawScore: rs.rawScore, baseScore, thresholdScore };
  });

  if (scored.length === 0) {
    return undefined;
  }

  // --- Pre-threshold bilingual title detection ---
  // When a mixed-case candidate at position 0 is followed by an ALL_CAPS candidate
  // at position ≤ 2 that is semantically similar to it, this is a bilingual recipe
  // page (e.g., Polish title + ALL_CAPS Korean romanization). Suppress confirmed
  // translation candidates before computing threshold so their bonuses don't inflate
  // the threshold beyond the mixed-case title's reach.
  // Note: we check position ≤ 2 (local proximity), not global ALL_CAPS count, so
  // section headers later in the document (SKŁADNIKI, WARZYWA, etc.) are irrelevant.
  let translationCandidates: typeof scored = [];
  let scoredForThreshold = scored;
  const prePos0 = scored.find((s) => s.position === 0 && !isAllCaps(s.text));
  if (prePos0) {
    const nearbyAllCaps = scored.filter(
      (s) => isAllCaps(s.text) && s.position >= 1 && s.position <= 2 && s.origin === "single"
    );
    const pos0Embedding = rawScored.find((r) => r.text === prePos0.text)?.embedding;

    // Method 1: embedding similarity (works for related languages)
    if (pos0Embedding && nearbyAllCaps.length > 0) {
      translationCandidates = nearbyAllCaps.filter((cap) => {
        const capEmbedding = rawScored.find((r) => r.text === cap.text)?.embedding;
        if (!capEmbedding) return false;
        return cosineSimilarity(pos0Embedding, capEmbedding) > 0.4;
      });
    }

    // Method 2: layout-based detection (cross-lingual fallback).
    // When embedding similarity is insufficient (e.g. Polish ↔ Korean romanization),
    // detect bilingual layout by position and word overlap:
    // mixed-case ≥2 words at pos 0 + ALL_CAPS ≥2 words at pos 1-2 with no shared words.
    if (translationCandidates.length === 0 && wordCount(prePos0.text) >= 2) {
      const pos0Words = new Set(
        prePos0.text.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
      );
      translationCandidates = nearbyAllCaps.filter((cap) => {
        if (wordCount(cap.text) < 2) return false;
        const capWords = cap.text.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
        return !capWords.some((w) => pos0Words.has(w));
      });
    }

    if (translationCandidates.length > 0) {
      // Suppress standalone translations and any multi-line joins that embed the translation
      // as a suffix or substring (e.g. "Smażona zielona fasolka GREEN BEANS BORKEUM" ends with
      // the translation; "Title GREEN BEANS BORKEUM 그린빈" includes it as a substring).
      scoredForThreshold = scored.filter((s) => {
        const sLower = s.text.toLowerCase();
        return !translationCandidates.some((t) => {
          const tLower = t.text.toLowerCase();
          return sLower.startsWith(tLower) ||
                 sLower.endsWith(" " + tLower) ||
                 sLower.includes(" " + tLower);
        });
      });
    }
  }

  // Fix 2: If the structural heading was identified as a bilingual translation, reassign it.
  // This prevents the translation's ALL_CAPS bonus from inflating the threshold and ensures
  // the fallback path in scored also uses the correct heading.
  if (
    translationCandidates.length > 0 &&
    firstStructuralHeading &&
    translationCandidates.some((t) => t.text === firstStructuralHeading!.text)
  ) {
    const nonTranslationStructural = structuralCandidates.filter(
      (sc) => !translationCandidates.some((t) => t.text === sc.text)
    );
    const newHeading = nonTranslationStructural.length > 0
      ? nonTranslationStructural.reduce((a, b) => a.rawScore > b.rawScore ? a : b)
      : undefined;

    // Patch scored array: remove old structural bonus, apply new one
    for (const s of scored) {
      if (s.text === firstStructuralHeading.text) {
        s.score -= 0.10;
        s.baseScore -= 0.10;
      }
      if (newHeading && s.text === newHeading.text) {
        s.score += 0.10;
        s.baseScore += 0.10;
      }
    }
    // Update reference for downstream prefix-removal logic
    firstStructuralHeading = newHeading ?? undefined;
  }

  // Use thresholdScore (excludes structural bonus) so the structural bonus doesn't inflate
  // the threshold and block equally-valid headings on multi-recipe pages.
  const bestThresholdScore = Math.max(...scoredForThreshold.map((s) => s.thresholdScore));
  const threshold = Math.max(0.08, bestThresholdScore * 0.7);

  // Filter candidates above threshold
  let selected = scoredForThreshold.filter((s) => s.score >= threshold);

  // Empty-pool fallback: when threshold filtering discards every candidate,
  // the hard filters' structural verdict should not be overruled by weak
  // embedding differentiation. Return the best positional candidate.
  if (selected.length === 0 && scored.length > 0) {
    const fallback = scored
      .slice()
      .sort((a, b) => a.position - b.position || b.score - a.score);
    selected = [fallback[0]];
  }

  // Remove word-boundary prefixes of firstStructuralHeading when the heading itself survived
  // the threshold. Cases:
  //   ARAYES case:  firstStructuralHeading = "ARAYES SHRAK" (2-word join qualifies; "ARAYES"
  //     alone = 1 word, so it never qualified). Filter removes "ARAYES" so dedup keeps the join.
  //   SAFFRON case: baseHeading was the partial line; continuation logic above upgraded
  //     firstStructuralHeading to the full join. Filter removes the partial so dedup keeps join.
  // Safety: only fires when the complete heading itself is in selected (passed the threshold).
  if (firstStructuralHeading && selected.some((s) => s.text === firstStructuralHeading.text)) {
    const fshLower = firstStructuralHeading.text.toLowerCase();
    selected = selected.filter((s) => {
      if (s.text === firstStructuralHeading.text) return true;
      const sLower = s.text.toLowerCase();
      // Remove s if it is a space-delimited prefix of the structural heading
      return !fshLower.startsWith(sLower + " ");
    });
  }

  // Protect continuation joins: when a multi-line join (2-line or 3-line) survived the threshold
  // and its second part starts with a continuation character, remove the single-line prefix/suffix
  // so the dedup "shorter wins" rule doesn't destroy the complete join.
  // Note: the pre-merge step above already handles the common Baked Eggs case (&/continuation
  // on next line) by turning it into a single candidate — this block covers the rarer case where
  // a continuation-character join was generated as a 2-line/3-line candidate and the prefix
  // single also survived threshold independently (e.g. from a different code path or OCR layout).
  // Safety: only fires for joins whose continuation starts with /&+:( — digit continuations
  // like "Pierogi Ruskie 200g mąki" are NOT protected, so dedup correctly keeps the shorter form.
  const survivingJoins = selected.filter((s) => s.origin === "2-line" || s.origin === "3-line");
  if (survivingJoins.length > 0) {
    selected = selected.filter((s) => {
      if (s.origin !== "single") return true;
      const sLower = s.text.toLowerCase();
      // Remove PREFIX singles whose continuation join also survived
      const isPrefixOfJoin = survivingJoins.some((j) => {
        const jLower = j.text.toLowerCase();
        if (!jLower.startsWith(sLower + " ")) return false;
        const remainder = jLower.slice(sLower.length + 1);
        return /^[/&+:(]/.test(remainder);
      });
      if (isPrefixOfJoin) return false;
      // Remove SUFFIX singles (e.g. "& Coriander") whose parent join also survived
      const isSuffixOfJoin = survivingJoins.some((j) => {
        const jLower = j.text.toLowerCase();
        if (!jLower.endsWith(" " + sLower)) return false;
        // Only remove if the suffix starts with a continuation character
        return /^[/&+:(]/.test(sLower);
      });
      if (isSuffixOfJoin) return false;
      return true;
    });
  }

  // Pre-dedup: remove sub-section headers that are substrings of other surviving candidates.
  // A sub-section header is an ALL_CAPS candidate followed by ingredient-like lines in the source.
  // Example: "CHLEBEK" (bread section header, followed by "500 g mąki") is a substring of
  // "CHLEBEK Z WARZYWAMI I BOCZKIEM" (the real title). Without this filter, dedup kills the title.
  selected = selected.filter((candidate) => {
    if (!isAllCaps(candidate.text)) return true;
    // Check if this candidate is immediately followed by ingredient-like content
    const nextSourceLines = lines.slice(candidate.position + 1, candidate.position + 2);
    const followedByIngredients = nextSourceLines.some(
      (l) => looksLikeIngredient(l.trim()) || startsWithNumber(l.trim())
    );
    if (!followedByIngredients) return true;
    // Only remove if a longer candidate contains this one as a substring
    const candidateLower = candidate.text.toLowerCase();
    const hasLongerParent = rawScored.some(
      (other) =>
        other.text !== candidate.text &&
        other.text.length > candidate.text.length &&
        other.text.toLowerCase().includes(candidateLower)
    );
    return !hasLongerParent;
  });

  // Deduplicate: if one title is a substring of another, keep the shorter (more focused) one.
  // DO NOT CHANGE THIS LOGIC — it has been incorrectly "improved" by the title-loop 5 times.
  // The tests require shorter wins: "Pierogi Ruskie" over "Pierogi Ruskie 200g mąki 3 ziemniaki".
  // The pre-filter above handles the conflicting case (structural heading prefix removal) so that
  // the incomplete prefix line is never present here when the complete join is in selected.
  selected = selected.filter((a) => {
    const aLower = a.text.toLowerCase();
    return !selected.some(
      (b) =>
        b !== a &&
        aLower.includes(b.text.toLowerCase()) &&
        b.text.length < a.text.length
    );
  });

  // Multi-title guard: only join multiple candidates with "+" when there is
  // structural evidence of a multi-recipe page (≥2 ALL_CAPS headings).
  // A single ALL_CAPS title among mixed-case survivors is a single-recipe page —
  // collapse to the highest-scoring candidate.
  // Zero ALL_CAPS survivors → mixed-case multi-title page → keep all.
  if (selected.length > 1) {
    const allCapsSelected = selected.filter((s) => isAllCaps(s.text));
    if (allCapsSelected.length >= 2) {
      // Check whether non-first ALL_CAPS headings are section headers within one recipe
      // (followed immediately by ingredient-like content) rather than separate recipe titles.
      // A multi-recipe page has body text between titles; a single-recipe page has
      // ingredient lines immediately after each section heading.
      const sortedCaps = [...allCapsSelected].sort((a, b) => a.position - b.position);
      const isSubHeader = sortedCaps.slice(1).every((cap) => {
        const nextLines = lines.slice(cap.position + 1, cap.position + 3);
        return nextLines.some(
          (l) => looksLikeIngredient(l.trim()) || /^\s*\d/.test(l.trim())
        );
      });
      if (isSubHeader) {
        selected = [sortedCaps[0]];
      } else {
        selected = allCapsSelected;
      }
    } else if (allCapsSelected.length === 1) {
      selected = [selected.reduce((a, b) => (a.score > b.score ? a : b))];
    }
  }

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

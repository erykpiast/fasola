/**
 * Title Extraction Heuristics
 * Extracts potential recipe title from OCR text using simple rules
 */

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

/**
 * Check if a line looks like an ingredient (contains measurements)
 */
function looksLikeIngredient(line: string): boolean {
  const lowerLine = line.toLowerCase();
  return MEASUREMENT_PATTERNS.some((pattern) => lowerLine.includes(pattern));
}

/**
 * Check if a line is all caps (likely a section header, not a title)
 */
function isAllCaps(line: string): boolean {
  const letters = line.replace(/[^a-zA-Z]/g, "");
  return letters.length > 0 && letters === letters.toUpperCase();
}

/**
 * Check if a line starts with a number (likely an ingredient or instruction)
 */
function startsWithNumber(line: string): boolean {
  return /^\s*\d/.test(line);
}

/**
 * Extract potential recipe title from OCR text
 * Uses heuristics to find the first line that looks like a title
 */
export function extractTitle(text: string): string | undefined {
  if (!text || text.trim().length === 0) {
    return undefined;
  }

  const lines = text.split("\n").map((line) => line.trim());

  for (const line of lines) {
    // Skip empty lines
    if (line.length === 0) {
      continue;
    }

    // Title should be reasonable length (3-50 chars)
    if (line.length < 3 || line.length > 50) {
      continue;
    }

    // Skip if it looks like an ingredient
    if (looksLikeIngredient(line)) {
      continue;
    }

    // Skip if all caps (likely a section header)
    if (isAllCaps(line)) {
      continue;
    }

    // Skip if starts with a number
    if (startsWithNumber(line)) {
      continue;
    }

    // This line passes all checks - likely a title
    return line;
  }

  return undefined;
}




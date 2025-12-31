/**
 * Recipe metadata validation and normalization utilities
 */

/**
 * Validates that a tag string starts with # and contains no spaces
 */
export function isValidTag(tag: string): boolean {
  if (typeof tag !== "string") {
    return false;
  }
  return tag.startsWith("#") && !tag.includes(" ");
}

/**
 * Normalizes a single tag by:
 * - Adding # prefix if missing
 * - Trimming whitespace
 * - Returning null if the result contains spaces (invalid)
 */
export function normalizeTag(input: string): string | null {
  if (typeof input !== "string") return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  const prefixed = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;

  // Check for spaces (invalid tag)
  if (prefixed.includes(" ")) return null;

  return prefixed;
}

/**
 * Parses comma/space separated tag string into normalized array
 * Filters out invalid tags (containing spaces)
 */
export function parseTags(input: string): Array<`#${string}`> {
  if (!input.trim()) return [];

  // Split by comma or space
  const parts = input.split(/[,\s]+/).filter((s) => s.length > 0);

  const normalized = parts
    .map(normalizeTag)
    .filter((tag): tag is string => tag !== null);

  return normalized as Array<`#${string}`>;
}

/**
 * Validates that all tags in array start with # and contain no spaces
 */
export function validateTags(tags: Array<string>): boolean {
  return tags.every(isValidTag);
}

/**
 * Detects if a string is a URL (http or https)
 */
export function isUrl(source: string): boolean {
  return /^https?:\/\/.+/.test(source);
}

/**
 * Extracts hostname from URL string
 * Returns null if not a valid URL
 */
export function extractHostname(url: string): string | null {
  if (!isUrl(url)) return null;

  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return null;
  }
}

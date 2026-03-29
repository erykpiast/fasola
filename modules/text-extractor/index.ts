import TextExtractorModule from "./src/TextExtractorModule";

export type { TextObservation, BoundingBox } from "./src/types";

/**
 * Extracts text with bounding box data from an image.
 * Each observation includes text, confidence, and normalized bounds (0-1, top-left origin).
 */
export async function extractTextWithBounds(
  uri: string
): ReturnType<typeof TextExtractorModule.extractText> {
  const processedUri = uri.replace("file://", "");
  return TextExtractorModule.extractText(processedUri);
}

/**
 * Extracts text strings from an image (convenience wrapper).
 */
export async function extractTextFromImage(uri: string): Promise<string[]> {
  const observations = await extractTextWithBounds(uri);
  return observations.map((o) => o.text);
}

import ExpoTextExtractorModule from "./src/ExpoTextExtractorModule";

export type { TextObservation, BoundingBox } from "./src/types";

/**
 * Whether text extraction is supported on the current device.
 */
export const isSupported = ExpoTextExtractorModule.isSupported;

/**
 * Extracts text from an image (backward-compatible, text-only).
 */
export async function extractTextFromImage(uri: string): Promise<string[]> {
  const processedUri = uri.replace("file://", "");
  return ExpoTextExtractorModule.extractTextFromImage(processedUri);
}

/**
 * Extracts text with bounding box data from an image.
 * Each observation includes text, confidence, and normalized bounds (0-1, top-left origin).
 */
export async function extractTextWithBounds(
  uri: string
): ReturnType<typeof ExpoTextExtractorModule.extractTextWithBounds> {
  const processedUri = uri.replace("file://", "");
  return ExpoTextExtractorModule.extractTextWithBounds(processedUri);
}

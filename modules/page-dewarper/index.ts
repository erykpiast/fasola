import PageDewarperModule, {
  type DewarpResult,
} from "./src/PageDewarperModule";

export type { DewarpResult };

/**
 * Dewarp a page image, returning a BW-thresholded image optimized for OCR.
 */
export async function dewarpImage(uri: string): Promise<DewarpResult> {
  return PageDewarperModule.dewarpImage(uri);
}

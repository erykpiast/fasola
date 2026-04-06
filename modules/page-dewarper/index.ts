import PageDewarperModule, {
  type DewarpResult,
} from "./src/PageDewarperModule";

export type { DewarpResult };

/**
 * Dewarp a page image, returning both a color-dewarped image and a BW-thresholded image.
 * The color image is for display; the BW image is optimized for OCR.
 */
export async function dewarpImage(uri: string): Promise<DewarpResult> {
  const processedUri = uri.replace("file://", "");
  return PageDewarperModule.dewarpImage(processedUri);
}

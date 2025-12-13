import type { DataUrl } from "@/lib/types/primitives";
import { dewarpImage } from "../page-dewarp-browser";
import type { PhotoAdjustmentConfig } from "../types";

/**
 * Apply geometry correction using browser-compatible OpenCV implementation
 * This handles perspective correction and page boundary detection
 */
export async function applyGeometryCorrection(
  imageDataUrl: DataUrl,
  config: Partial<PhotoAdjustmentConfig["geometry"]>
): Promise<DataUrl> {
  // Use browser-compatible dewarping implementation
  return dewarpImage(imageDataUrl, {
    xMargin: config.xMargin,
    yMargin: config.yMargin,
    outputZoom: config.outputZoom,
    noBinary: config.noBinary,
  });
}

/**
 * Check if an image likely contains a page/document
 * This is a simple heuristic - OpenCV will do the actual detection
 */
export function likelyContainsPage(imageData: ImageData): boolean {
  // Simple heuristic: check if image is large enough
  const minWidth = 200;
  const minHeight = 200;

  return imageData.width >= minWidth && imageData.height >= minHeight;
}

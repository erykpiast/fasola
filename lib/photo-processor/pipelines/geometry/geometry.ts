import type { DataUrl } from "@/lib/types/primitives";
import { processDewarp } from "./dewarp-pipeline";
import type { PhotoAdjustmentConfig } from "../../types";

/**
 * Load OpenCV.js for web platform
 */
async function loadOpenCV(): Promise<any> {
  if ((window as any).cv?.Mat) {
    const cv = (window as any).cv;
    delete cv.then;
    return cv;
  }

  const existingScript = document.querySelector('script[src*="opencv.js"]');
  if (!existingScript) {
    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.5.2/opencv.js";
    document.head.appendChild(script);
  }

  const startTime = Date.now();
  while (!(window as any).cv?.Mat) {
    if (Date.now() - startTime > 60000) {
      throw new Error("OpenCV.js load timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  const cv = (window as any).cv;
  delete cv.then;
  return cv;
}

/**
 * Apply geometry correction using browser-compatible OpenCV implementation
 * This handles perspective correction and page boundary detection
 */
export async function applyGeometryCorrection(
  imageDataUrl: DataUrl,
  config: Partial<PhotoAdjustmentConfig["geometry"]>
): Promise<DataUrl> {
  const cv = await loadOpenCV();
  
  return processDewarp(cv, imageDataUrl, {
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

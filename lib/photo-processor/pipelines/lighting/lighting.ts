import type { DataUrl } from "@/lib/types/primitives";
import type { PhotoAdjustmentConfig } from "../../types";
import type { CV, WindowCV } from "../../types/opencv";
import { processLighting } from "./lighting-pipeline";

declare global {
  interface Window {
    cv?: WindowCV;
  }
}

/**
 * Load OpenCV.js for web platform
 */
async function loadOpenCV(): Promise<CV> {
  if (window.cv?.Mat) {
    const cv = window.cv;
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
  while (!window.cv?.Mat) {
    if (Date.now() - startTime > 60000) {
      throw new Error("OpenCV.js load timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  const cv = window.cv;
  delete cv.then;
  return cv;
}

/**
 * Apply lighting correction using browser-compatible OpenCV implementation
 * This handles white balance, illumination correction, and CLAHE
 */
export async function applyLightingCorrection(
  imageDataUrl: DataUrl,
  config: Partial<PhotoAdjustmentConfig["lighting"]>
): Promise<DataUrl> {
  const cv = await loadOpenCV();

  return processLighting(cv, imageDataUrl, {
    whiteBalance: config.whiteBalance ?? "gray-world",
    claheClipLimit: config.claheClipLimit ?? 2.5,
    claheTileSize: config.claheTileSize ?? 8,
  });
}

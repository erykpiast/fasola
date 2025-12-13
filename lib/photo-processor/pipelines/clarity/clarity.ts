import type { DataUrl } from "@/lib/types/primitives";
import type { PhotoAdjustmentConfig } from "../../types";
import type { CV, WindowCV } from "../../types/opencv";
import { processClarity } from "./clarity-pipeline";

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
 * Apply clarity enhancement using browser-compatible OpenCV implementation
 * This handles denoising and sharpening
 */
export async function applyClarityCorrection(
  imageDataUrl: DataUrl,
  config: Partial<PhotoAdjustmentConfig["clarity"]>
): Promise<DataUrl> {
  const cv = await loadOpenCV();

  return processClarity(cv, imageDataUrl, {
    denoiseStrength: config.denoiseStrength ?? 5,
    sharpenRadius: config.sharpenRadius ?? 1.5,
    sharpenAmount: config.sharpenAmount ?? 1.1,
    sharpenThreshold: config.sharpenThreshold ?? 3,
  });
}


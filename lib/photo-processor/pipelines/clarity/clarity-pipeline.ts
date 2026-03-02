/**
 * Main clarity enhancement pipeline
 * Orchestrates denoising and sharpening for improved text readability
 */

import type { DataUrl } from "@/lib/types/primitives";
import type { CV } from "../../types/opencv";
import { loadImageMat, matToDataUrl } from "../geometry/utils";
import { applyDenoise } from "./denoise";
import { applyUnsharpMask } from "./unsharp-mask";

export interface ClarityConfig {
  denoiseStrength: number; // 3-7, bilateral filter sigma
  sharpenRadius: number; // 1.2-1.8, Gaussian blur sigma
  sharpenAmount: number; // 0.8-1.4, unsharp mask strength
  sharpenThreshold: number; // 2-4, edge threshold
}

/**
 * Process image through clarity enhancement pipeline
 */
export async function processClarity(
  cv: CV,
  imageDataUrl: DataUrl,
  config: ClarityConfig
): Promise<DataUrl> {
  console.log("[Clarity Pipeline] Processing image with OpenCV:", {
    cvAvailable: !!cv,
    hasMat: !!(cv && cv.Mat),
    config,
  });

  console.log("  Loading image...");
  const cv2_img = await loadImageMat(cv, imageDataUrl);

  // Convert RGBA to BGR
  const bgr = new cv.Mat();
  cv.cvtColor(cv2_img, bgr, cv.COLOR_RGBA2BGR);
  cv2_img.delete();

  console.log(`  Loaded image at ${bgr.rows}x${bgr.cols}`);

  let current = bgr;

  try {
    // Phase 1: Denoise with bilateral filter
    const denoised = applyDenoise(cv, current, config.denoiseStrength);
    if (current !== bgr) current.delete();
    current = denoised;

    // Phase 2: Sharpen with unsharp mask
    const sharpened = applyUnsharpMask(
      cv,
      current,
      config.sharpenRadius,
      config.sharpenAmount,
      config.sharpenThreshold
    );
    if (current !== bgr) current.delete();
    current = sharpened;

    // Convert to data URL
    console.log("  Converting result to data URL...");
    const result = matToDataUrl(cv, current, "bgr");

    // Cleanup
    current.delete();

    console.log("  Done.");
    return result;
  } catch (error) {
    // Cleanup on error
    if (current && !current.isDeleted()) {
      current.delete();
    }
    throw error;
  }
}

/**
 * Main lighting correction pipeline
 * Orchestrates white balance, illumination correction, and CLAHE
 */

import type { DataUrl } from "@/lib/types/primitives";
import type { CV } from "../../types/opencv";
import { loadImageMat, matToDataUrl } from "../geometry/utils";
import { applyCLAHE } from "./clahe";
import { applyIlluminationCorrection } from "./illumination";
import { applyWhiteBalance } from "./white-balance";

export interface LightingConfig {
  whiteBalance: "gray-world" | "simple" | "none";
  claheClipLimit: number;
  claheTileSize: number;
}

/**
 * Process image through lighting correction pipeline
 */
export async function processLighting(
  cv: CV,
  imageDataUrl: DataUrl,
  config: LightingConfig
): Promise<DataUrl> {
  console.log("[Lighting Pipeline] Processing image with OpenCV:", {
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
    // Phase 1: White balance correction
    if (config.whiteBalance !== "none") {
      const balanced = applyWhiteBalance(cv, current, config.whiteBalance);
      if (current !== bgr) current.delete();
      current = balanced;
    }

    // Phase 2: Illumination correction
    const illuminated = applyIlluminationCorrection(cv, current);
    if (current !== bgr) current.delete();
    current = illuminated;

    // Phase 3: CLAHE for local contrast
    const enhanced = applyCLAHE(
      cv,
      current,
      config.claheClipLimit,
      config.claheTileSize
    );
    if (current !== bgr) current.delete();
    current = enhanced;

    // Convert to data URL
    console.log("  Converting result to data URL...");
    const result = matToDataUrl(cv, current);

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

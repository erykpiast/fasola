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

export interface LightingResult {
  coloredUri: DataUrl;
  grayscaleUri: DataUrl;
}

/**
 * Process image through lighting correction pipeline
 * Returns both a colored version for display and a grayscale version for OCR
 */
export async function processLighting(
  cv: CV,
  imageDataUrl: DataUrl,
  config: LightingConfig
): Promise<LightingResult> {
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

    // Phase 2: Illumination correction (preserves colors)
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

    // Convert colored version to data URL
    console.log("  Converting colored result to data URL...");
    const coloredUri = matToDataUrl(cv, current);

    // Create grayscale version for OCR
    console.log("  Creating grayscale version for OCR...");
    const gray = new cv.Mat();
    cv.cvtColor(current, gray, cv.COLOR_BGR2GRAY);
    const grayBgr = new cv.Mat();
    cv.cvtColor(gray, grayBgr, cv.COLOR_GRAY2BGR);
    const grayscaleUri = matToDataUrl(cv, grayBgr);

    // Cleanup
    current.delete();
    gray.delete();
    grayBgr.delete();

    console.log("  Done.");
    return { coloredUri, grayscaleUri };
  } catch (error) {
    // Cleanup on error
    if (current && !current.isDeleted()) {
      current.delete();
    }
    throw error;
  }
}

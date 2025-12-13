/**
 * Main lighting correction pipeline
 * Orchestrates white balance, illumination correction, and CLAHE
 */

import type { DataUrl } from "@/lib/types/primitives";
import { loadImageMat, matToDataUrl } from "../geometry/utils";
import { applyCLAHE } from "./clahe";
import { applyIlluminationCorrection } from "./illumination";
import { applyWhiteBalance } from "./white-balance";

export interface LightingConfig {
  whiteBalance: "gray-world" | "simple" | "none";
  claheClipLimit: number;
  claheTileSize: number;
}

interface Mat {
  delete(): void;
  isDeleted(): boolean;
}

interface CV {
  cvtColor(src: Mat, dst: Mat, code: number): void;
  COLOR_RGBA2BGR: number;
  Mat: {
    new (): Mat;
  };
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
  const cv2_img = await loadImageMat(cv as any, imageDataUrl);

  // Convert RGBA to BGR
  const bgr = new cv.Mat();
  cv.cvtColor(cv2_img as any, bgr, cv.COLOR_RGBA2BGR);
  (cv2_img as any).delete();

  console.log(`  Loaded image at ${bgr.rows}x${bgr.cols}`);

  let current = bgr;

  try {
    // Phase 1: White balance correction
    if (config.whiteBalance !== "none") {
      const balanced = applyWhiteBalance(
        cv as any,
        current,
        config.whiteBalance
      );
      if (current !== bgr) current.delete();
      current = balanced;
    }

    // Phase 2: Illumination correction
    const illuminated = applyIlluminationCorrection(cv as any, current);
    if (current !== bgr) current.delete();
    current = illuminated;

    // Phase 3: CLAHE for local contrast
    const enhanced = applyCLAHE(
      cv as any,
      current,
      config.claheClipLimit,
      config.claheTileSize
    );
    if (current !== bgr) current.delete();
    current = enhanced;

    // Convert to data URL
    console.log("  Converting result to data URL...");
    const result = matToDataUrl(cv as any, current as any);

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

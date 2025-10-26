/**
 * OpenCV.js loader for web platform.
 * Uses @techstark/opencv-js npm package.
 */

import type { DataUrl, PhotoUri } from "@/lib/types/primitives";
import cvReadyPromise, { Mat } from "@techstark/opencv-js";
import type {
  ImageOperation,
  OpenCVInstance,
  OpenCVWebViewBridge,
  ProcessImageResult,
} from "./opencv-loader.d";
import {
  applyGeometryCorrection,
  loadImageToMat,
  matToDataUrl,
} from "./pipelines/opencv-core";
import type { DebugVisualizationData } from "./types";

type RawOpenCVInstance = Awaited<typeof cvReadyPromise>;

let rawOpenCVInstance: RawOpenCVInstance | null = null;
let loadingPromise: Promise<OpenCVInstance> | null = null;

/**
 * Load and initialize OpenCV.js library.
 * Returns cached instance on subsequent calls.
 */
export async function loadOpenCV(): Promise<OpenCVInstance> {
  if (rawOpenCVInstance) {
    return createOpenCVInstance(rawOpenCVInstance);
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    try {
      const cv = await cvReadyPromise;
      rawOpenCVInstance = cv;
      return createOpenCVInstance(cv);
    } catch (error) {
      console.error("[OpenCV] Failed to load OpenCV.js:", error);
      throw error;
    }
  })();

  return loadingPromise;
}

/**
 * Check if OpenCV.js is currently loaded.
 */
export function isOpenCVLoaded(): boolean {
  return rawOpenCVInstance !== null;
}

/**
 * Get the current OpenCV instance without loading.
 * Returns null if not loaded.
 */
export function getOpenCVInstance(): OpenCVInstance | null {
  return rawOpenCVInstance ? createOpenCVInstance(rawOpenCVInstance) : null;
}

/**
 * Get the WebView bridge instance (not applicable on web).
 */
export function getWebViewBridge(): OpenCVWebViewBridge {
  throw new Error("WebView bridge is not available on web platform");
}

/**
 * Create a platform-agnostic OpenCV instance wrapper.
 */
function createOpenCVInstance(cv: RawOpenCVInstance): OpenCVInstance {
  return {
    async processImage(
      imageUri: PhotoUri,
      operations: Array<ImageOperation>
    ): Promise<ProcessImageResult> {
      console.log("[OpenCV Web] Processing image with operations:", operations);

      let src: Mat | null = null;
      let processedMat: Mat | null = null;
      let debugData: DebugVisualizationData | undefined;

      try {
        // Load image into OpenCV Mat
        src = await loadImageToMat(cv, imageUri);

        processedMat = src;

        if (processedMat === null) {
          throw new Error("Failed to load image");
        }

        // Apply operations sequentially
        for (const operation of operations) {
          if (operation.type === "passthrough") {
            // No processing needed
            continue;
          } else if (operation.type === "geometry") {
            const result = applyGeometryCorrection(
              { ...cv, COLOR_RGBA2GRAY: cv.COLOR_RGBA2GRAY },
              processedMat!,
              operation.debug
            );
            if (result.mat) {
              // Geometry correction succeeded, use the result
              if (processedMat !== src) {
                processedMat!.delete();
              }
              processedMat = result.mat;
            }
            // Collect debug data if available
            if (result.debug) {
              debugData = result.debug;
            }
            // If geometry correction fails, continue with the original
          }
        }

        // Convert result to data URL
        const processedUri = matToDataUrl(cv, processedMat);
        return {
          dataUrl: processedUri as DataUrl,
          debug: debugData,
        };
      } finally {
        // Clean up OpenCV Mats
        if (src) {
          src.delete();
        }
        if (processedMat && processedMat !== src) {
          processedMat.delete();
        }
      }
    },
  };
}

/**
 * OpenCV.js loader for web platform.
 * Uses @techstark/opencv-js npm package.
 */

import type { DataUrl, PhotoUri } from "@/lib/types/primitives";
import cvReadyPromise from "@techstark/opencv-js";
import type {
  ImageOperation,
  OpenCVInstance,
  OpenCVWebViewBridge,
} from "./opencv-loader";

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
    ): Promise<DataUrl> {
      // Phase 0: Just return the original image
      // Processing operations will be implemented in future phases
      console.log("[OpenCV Web] Processing image with operations:", operations);
      return imageUri as DataUrl;
    },
  };
}

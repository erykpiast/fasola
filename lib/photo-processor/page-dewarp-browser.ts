/**
 * Browser-compatible page dewarping implementation
 * Based on page-dewarp-js but adapted for browser environments
 *
 * This file provides a simple API that accepts ImageData and returns dewarped ImageData
 * without requiring Node.js dependencies like 'canvas' or 'fs'
 */

import type { DataUrl } from "@/lib/types/primitives";
import { processDewarp, type DewarpConfig } from "./pipelines/dewarp-pipeline";

// OpenCV.js loading state
let opencvInstance: any = null;
let isLoading = false;

/**
 * Load opencv.js from CDN using simple polling
 */
async function loadOpenCV(): Promise<any> {
  console.log("[OpenCV] loadOpenCV called");

  // Already loaded?
  if (opencvInstance) {
    console.log("[OpenCV] Returning cached instance");
    // Return wrapped to avoid OpenCV's then() being called
    return Promise.resolve(opencvInstance);
  }

  // Already available in window?
  if ((window as any).cv?.Mat) {
    console.log("[OpenCV] Found cv in window, caching it");
    const cv = (window as any).cv;
    // Delete the 'then' method to prevent infinite promise resolution
    delete cv.then;
    opencvInstance = cv;
    return Promise.resolve(opencvInstance);
  }

  // Start loading if not already loading
  if (!isLoading) {
    console.log("[OpenCV] Starting load process");
    isLoading = true;

    // Add script if not present
    const existingScript = document.querySelector('script[src*="opencv.js"]');
    if (!existingScript) {
      console.log("[OpenCV] Adding script tag");
      const script = document.createElement("script");
      script.src = "https://docs.opencv.org/4.5.2/opencv.js";
      document.head.appendChild(script);
    } else {
      console.log("[OpenCV] Script already exists");
    }
  }

  // Poll for cv to become available
  console.log("[OpenCV] Starting polling for cv object");
  const startTime = Date.now();

  while (!opencvInstance) {
    if ((window as any).cv?.Mat) {
      console.log("[OpenCV] cv object detected!");
      const cv = (window as any).cv;
      
      // CRITICAL: Delete the 'then' method to prevent infinite promise resolution loop
      // OpenCV.js adds a 'then' method to Module, making it thenable
      // When we return it from an async function, JS tries to resolve it as a promise
      // This causes an infinite loop. Deleting 'then' breaks the chain.
      console.log("[OpenCV] Deleting cv.then to break promise chain");
      delete cv.then;
      
      opencvInstance = cv;
      isLoading = false;
      return Promise.resolve(opencvInstance);
    }

    const elapsed = Date.now() - startTime;
    if (elapsed > 60000) {
      isLoading = false;
      throw new Error("OpenCV.js load timeout");
    }

    console.log(`[OpenCV] Waiting... (${Math.round(elapsed / 1000)}s)`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return Promise.resolve(opencvInstance);
}

export async function dewarpImage(
  imageDataUrl: DataUrl,
  config: DewarpConfig = {}
): Promise<DataUrl> {
  console.log("[Dewarp] Starting dewarping process");

  try {
    console.log("[Dewarp] Loading OpenCV...");
    const cv = await loadOpenCV();
    console.log("[Dewarp] OpenCV loaded, cv object:", {
      exists: !!cv,
      hasMat: !!(cv && cv.Mat),
    });

    const result = await processDewarp(cv, imageDataUrl, config);

    console.log("[Dewarp] Dewarping complete");
    return result;
  } catch (error) {
    console.error("[Dewarp] Error during dewarping:", error);
    throw error;
  }
}

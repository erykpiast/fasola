/**
 * Main entry point for photo processing
 * Provides a unified API for all photo processing operations
 */

import type { DataUrl, PhotoUri } from "@/lib/types/primitives";
import {
  processClarity,
  processGeometry,
  processLighting,
} from "./opencv-bridge";
import type { PhotoAdjustmentConfig, ProcessingResult } from "./types";
import { loadImageAsDataUrl } from "./utils/loadImageAsDataUrl";

/**
 * Process a photo through the complete adjustment pipeline
 * @param photoUri - URI of the photo to process
 * @param config - Configuration for all processing phases
 * @returns Processing result with processed image URI
 */
export async function processPhoto(
  photoUri: PhotoUri,
  config: PhotoAdjustmentConfig
): Promise<ProcessingResult> {
  try {
    // Convert photo URI to data URL if needed
    let imageDataUrl: DataUrl;
    if (photoUri.startsWith("data:")) {
      imageDataUrl = photoUri as DataUrl;
    } else {
      imageDataUrl = await loadImageAsDataUrl(photoUri);
    }

    // Phase 1: Geometry correction (page dewarping)
    if (config.geometry.enabled) {
      console.log("[Photo Processor] Running geometry correction");
      const result = await processGeometry(imageDataUrl, config.geometry);

      if (!result.success) {
        console.warn(
          "[Photo Processor] Geometry correction failed, using original:",
          result.error
        );
        return {
          success: false,
          processedUri: imageDataUrl,
          error: {
            code: "DEWARP_FAILED",
            message: result.error || "Geometry correction failed",
          },
        };
      }

      imageDataUrl = result.processedUri!;
    }

    // Phase 2: Lighting correction
    if (config.lighting.enabled) {
      console.log("[Photo Processor] Running lighting correction");
      const result = await processLighting(imageDataUrl, config.lighting);

      if (!result.success) {
        console.warn(
          "[Photo Processor] Lighting correction failed, continuing with current image:",
          result.error
        );
        // Continue with current image (graceful degradation)
      } else {
        imageDataUrl = result.processedUri!;
      }
    }

    // Phase 3: Clarity enhancement
    if (config.clarity.enabled) {
      console.log("[Photo Processor] Running clarity enhancement");
      const result = await processClarity(imageDataUrl, config.clarity);

      if (!result.success) {
        console.warn(
          "[Photo Processor] Clarity enhancement failed, continuing with current image:",
          result.error
        );
        // Continue with current image (graceful degradation)
      } else {
        imageDataUrl = result.processedUri!;
      }
    }

    return {
      success: true,
      processedUri: imageDataUrl,
    };
  } catch (error) {
    console.error("[Photo Processor] Processing error:", error);
    return {
      success: false,
      processedUri: photoUri as DataUrl,
      error: {
        code: "PROCESSING_FAILED",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

// Re-export types and utilities for convenience
export {
  handleOpenCVMessage,
  OpenCVBridgeSetup,
  setOpenCVReady,
} from "./opencv-bridge";
export { DEFAULT_CONFIG } from "./types";
export type { PhotoAdjustmentConfig, ProcessingResult } from "./types";

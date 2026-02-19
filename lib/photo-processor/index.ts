/**
 * Main entry point for photo processing
 * Provides a unified API for all photo processing operations
 */

import type { DataUrl, PhotoUri } from "@/lib/types/primitives";
import type { OcrResult } from "./ocr-bridge/types";
import {
  processClarity,
  processGeometry,
  processLighting,
} from "./opencv-bridge";
import { processTextRecognition } from "./pipelines/text-recognition";
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
    let geometryOnlyDataUrl: DataUrl;
    if (photoUri.startsWith("data:")) {
      imageDataUrl = photoUri as DataUrl;
    } else {
      imageDataUrl = await loadImageAsDataUrl(photoUri);
    }
    geometryOnlyDataUrl = imageDataUrl;

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
          processedUri: geometryOnlyDataUrl,
          error: {
            code: "DEWARP_FAILED",
            message: result.error || "Geometry correction failed",
          },
        };
      }

      imageDataUrl = result.processedUri!;
      geometryOnlyDataUrl = imageDataUrl;
    }

    // Phase 2: Lighting correction
    let grayscaleImageDataUrl: DataUrl | undefined;
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
        grayscaleImageDataUrl = result.grayscaleUri;
      }
    }

    // Phase 3: Clarity enhancement
    if (config.clarity.enabled) {
      console.log(
        "[Photo Processor] Running clarity enhancement on colored image"
      );
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

      if (grayscaleImageDataUrl) {
        console.log(
          "[Photo Processor] Running clarity enhancement on grayscale image"
        );
        const grayscaleResult = await processClarity(
          grayscaleImageDataUrl,
          config.clarity
        );

        if (!grayscaleResult.success) {
          console.warn(
            "[Photo Processor] Grayscale clarity enhancement failed, using original grayscale:",
            grayscaleResult.error
          );
          // Continue with original grayscale (graceful degradation)
        } else {
          grayscaleImageDataUrl = grayscaleResult.processedUri!;
        }
      }
    }

    // Phase 4: Text Recognition
    let ocrResult: OcrResult | undefined;
    if (config.ocr.enabled) {
      console.log("[Photo Processor] Running text recognition");
      // Use grayscale version for OCR if available, otherwise use colored version
      const ocrImageDataUrl = grayscaleImageDataUrl || imageDataUrl;
      const result = await processTextRecognition(ocrImageDataUrl);

      if (!result.success) {
        console.warn(
          "[Photo Processor] Text recognition failed, continuing without OCR:",
          result.error
        );
        // Continue - OCR failure shouldn't block image processing
      } else {
        ocrResult = result.ocrResult;
      }
    }

    return {
      success: true,
      processedUri: geometryOnlyDataUrl,
      ocrResult,
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

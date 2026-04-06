/**
 * Main entry point for photo processing
 * Provides a unified API for all photo processing operations
 */

import type { DataUrl, PhotoUri } from "@/lib/types/primitives";
import { processGeometryNative } from "./geometry";
import type { OcrResult } from "./ocr-bridge/types";
import { processTextRecognition } from "./pipelines/text-recognition";
import type { PhotoAdjustmentConfig, ProcessingResult } from "./types";
import { loadImageAsDataUrl } from "./utils/loadImageAsDataUrl";

/**
 * Process a photo through the complete adjustment pipeline
 * @param photoUri - URI of the photo to process (file path or DataUrl)
 * @param config - Configuration for all processing phases
 * @param originalFileUri - Optional original file URI for native processing (avoids base64 bridge overhead)
 * @returns Processing result with processed image URI
 */
export async function processPhoto(
  photoUri: PhotoUri,
  config: PhotoAdjustmentConfig,
  originalFileUri?: string
): Promise<ProcessingResult> {
  try {
    // Convert photo URI to data URL if needed
    let imageDataUrl: DataUrl;
    if (photoUri.startsWith("data:")) {
      imageDataUrl = photoUri as DataUrl;
    } else {
      imageDataUrl = await loadImageAsDataUrl(photoUri);
    }
    let geometryOnlyDataUrl: DataUrl = imageDataUrl;

    // Phase 1: Geometry correction (native on iOS, WebView on web)
    // On failure, continue with the original image (graceful degradation).
    // Native geometry produces both a color image (for display) and a BW image (for OCR).
    let bwImageUri: string | undefined;
    if (config.geometry.enabled) {
      console.log("[Photo Processor] Running geometry correction");
      const geoResult = await processGeometryNative(
        originalFileUri || photoUri,
        config.geometry as unknown as Record<string, unknown>
      );

      if (!geoResult.success || !geoResult.processedUri) {
        console.warn(
          "[Photo Processor] Geometry correction failed, using original:",
          geoResult.error
        );
      } else {
        imageDataUrl = geoResult.processedUri;
        geometryOnlyDataUrl = imageDataUrl;
        bwImageUri = geoResult.bwUri;
      }
    }

    // Phase 2: Text Recognition
    // Use BW image from native dewarping (adaptive-thresholded) if available,
    // otherwise use the color image.
    let ocrResult: OcrResult | undefined;
    if (config.ocr.enabled) {
      console.log("[Photo Processor] Running text recognition");
      let ocrImageDataUrl: DataUrl;
      if (bwImageUri) {
        ocrImageDataUrl = await loadImageAsDataUrl(bwImageUri);
      } else {
        ocrImageDataUrl = imageDataUrl;
      }
      const result = await processTextRecognition(
        ocrImageDataUrl,
        config.ocr.language
      );

      if (!result.success) {
        console.warn(
          "[Photo Processor] Text recognition failed, continuing without OCR:",
          result.error
        );
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

export { DEFAULT_CONFIG } from "./types";
export type { PhotoAdjustmentConfig, ProcessingResult } from "./types";

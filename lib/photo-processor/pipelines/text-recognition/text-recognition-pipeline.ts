/**
 * Text Recognition Pipeline
 * Extracts text from images using platform-specific OCR while passing through the image unchanged
 */

import type { DataUrl } from "@/lib/types/primitives";
import { extractText } from "../../ocr-bridge";
import type { OcrResult } from "../../ocr-bridge/types";

/**
 * Result from text recognition pipeline
 */
export interface TextRecognitionResult {
  success: boolean;
  imageDataUrl: DataUrl;
  ocrResult?: OcrResult;
  error?: string;
}

/**
 * Process image through text recognition pipeline
 * Returns the image unchanged while extracting text as a side effect
 * @param imageDataUrl - Data URL of the image to process
 * @returns Original image with OCR result
 */
export async function processTextRecognition(
  imageDataUrl: DataUrl
): Promise<TextRecognitionResult> {
  try {
    console.log("[Text Recognition Pipeline] Extracting text from image");

    const ocrResult = await extractText(imageDataUrl);

    if (!ocrResult.success) {
      console.warn(
        "[Text Recognition Pipeline] OCR extraction failed:",
        ocrResult.error
      );
      return {
        success: false,
        imageDataUrl,
        error: ocrResult.error,
      };
    }

    console.log(
      `[Text Recognition Pipeline] Text extraction complete: ${
        ocrResult.text?.length ?? 0
      } characters`
    );

    return {
      success: true,
      imageDataUrl,
      ocrResult,
    };
  } catch (error) {
    console.error("[Text Recognition Pipeline] Processing error:", error);
    return {
      success: false,
      imageDataUrl,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}




/**
 * Native OCR implementation using expo-text-extractor
 * Uses ML Kit on Android and Apple Vision on iOS
 */

import type { DataUrl } from "@/lib/types/primitives";
import { Paths } from "expo-file-system";
import { writeAsStringAsync } from "expo-file-system/legacy";
import { extractTextFromImage, isSupported } from "expo-text-extractor";
import type { OcrResult } from "./types";

/**
 * Dump image to disk for debugging purposes
 */
async function dumpImageToDisk(imageUri: DataUrl): Promise<void> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `ocr-input-${timestamp}.jpg`;
    const fileUri = `${Paths.document?.uri}/${filename}`;

    // Convert base64 data URL to base64 string
    const base64Data = imageUri.split(",")[1] || imageUri;

    await writeAsStringAsync(fileUri, base64Data, {
      encoding: "base64",
    });

    console.log(`[OCR Bridge] Image dumped to: ${fileUri}`);
  } catch (error) {
    console.error("[OCR Bridge] Failed to dump image:", error);
  }
}

/**
 * Extract text from an image using platform-native OCR
 * @param imageUri - Data URL of the image to process
 * @returns OCR result with extracted text blocks
 */
export async function extractText(imageUri: DataUrl): Promise<OcrResult> {
  try {
    console.log("[OCR Bridge] Starting text extraction (native)");

    // Dump image to disk for debugging
    await dumpImageToDisk(imageUri);

    if (!isSupported) {
      console.warn("[OCR Bridge] OCR not supported on this device");
      return {
        success: false,
        error: "OCR not supported on this device",
      };
    }

    // Extract text using expo-text-extractor (ML Kit / Apple Vision)
    const textBlocks = await extractTextFromImage(imageUri);

    if (!textBlocks || textBlocks.length === 0) {
      console.log("[OCR Bridge] No text detected in image");
      return {
        success: true,
        text: "",
        textBlocks: [],
        confidence: 1.0,
      };
    }

    const fullText = textBlocks.join("\n");
    console.log(
      `[OCR Bridge] Text extraction complete: ${textBlocks.length} blocks, ${fullText.length} characters`
    );

    return {
      success: true,
      text: fullText,
      textBlocks,
      confidence: 1.0, // ML Kit/Vision don't expose confidence scores
    };
  } catch (error) {
    console.error("[OCR Bridge] Text extraction failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * No-op for native platform (no worker to terminate)
 */
export async function terminateWorker(): Promise<void> {
  // Native implementation doesn't use workers, nothing to terminate
}

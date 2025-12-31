/**
 * Web OCR implementation using Tesseract.js
 * Runs OCR in a Web Worker for off-thread processing
 */

import type { DataUrl } from "@/lib/types/primitives";
import { createWorker, type Worker } from "tesseract.js";
import type { OcrResult } from "./types";

// Persistent worker instance for reuse across multiple extractions
let worker: Worker | null = null;

/**
 * Extract text from an image using Tesseract.js OCR
 * @param imageUri - Data URL of the image to process
 * @returns OCR result with extracted text blocks and confidence
 */
export async function extractText(imageUri: DataUrl): Promise<OcrResult> {
  try {
    console.log("[OCR Bridge] Starting text extraction (web/tesseract)");

    // Lazy initialization: create worker on first use
    if (!worker) {
      console.log("[OCR Bridge] Initializing Tesseract worker");
      try {
        worker = await createWorker("eng", 1, {
          errorHandler: (err) =>
            console.error("[OCR Bridge] Worker error:", err),
        });
        console.log("[OCR Bridge] Tesseract worker ready");
      } catch (workerError) {
        console.error(
          "[OCR Bridge] Failed to create Tesseract worker:",
          workerError
        );
        return {
          success: false,
          error: `Worker initialization failed: ${
            workerError instanceof Error ? workerError.message : "Unknown error"
          }`,
        };
      }
    }

    // Perform OCR recognition
    const { data } = await worker.recognize(imageUri);

    if (!data.text || data.text.trim().length === 0) {
      console.log("[OCR Bridge] No text detected in image");
      return {
        success: true,
        text: "",
        textBlocks: [],
        confidence: 0,
      };
    }

    // Extract text blocks from Tesseract result
    const textBlocks = data.blocks
      ?.map((block) => block.text)
      .filter((text) => text.trim()) ?? [data.text];

    // Normalize confidence from 0-100 to 0-1
    const confidence = data.confidence / 100;

    console.log(
      `[OCR Bridge] Text extraction complete: ${textBlocks.length} blocks, ${
        data.text.length
      } characters, ${Math.round(confidence * 100)}% confidence`
    );

    return {
      success: true,
      text: data.text,
      textBlocks,
      confidence,
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
 * Terminate the Tesseract worker
 * Call this when OCR is no longer needed to free resources
 */
export async function terminateWorker(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
    console.log("[OCR Bridge] Tesseract worker terminated");
  }
}

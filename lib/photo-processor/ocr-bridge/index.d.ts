/**
 * Type declarations for OCR bridge module
 * Metro will automatically resolve to the correct platform-specific implementation
 */

import type { DataUrl } from "@/lib/types/primitives";
import type { OcrResult } from "./types";

/**
 * Extract text from an image using platform-native OCR
 */
export function extractText(imageUri: DataUrl): Promise<OcrResult>;

/**
 * Terminate the OCR worker (web only, no-op on native)
 */
export function terminateWorker(): Promise<void>;

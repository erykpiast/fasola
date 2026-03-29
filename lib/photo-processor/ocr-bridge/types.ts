/**
 * OCR Bridge Types
 * Shared types for platform-specific OCR implementations
 */

import type { TextObservation } from "text-extractor";

/**
 * Result from text extraction
 */
export interface OcrResult {
  success: boolean;
  text?: string;
  textBlocks?: Array<string>;
  confidence?: number;
  observations?: Array<TextObservation>;
  error?: string;
}

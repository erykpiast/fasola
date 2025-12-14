/**
 * OCR Bridge Types
 * Shared types for platform-specific OCR implementations
 */

/**
 * Result from text extraction
 */
export interface OcrResult {
  success: boolean;
  text?: string;
  textBlocks?: Array<string>;
  confidence?: number;
  error?: string;
}

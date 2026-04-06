import type { AppLanguage } from "@/lib/types/language";
import type { DataUrl } from "@/lib/types/primitives";
import type { OcrResult } from "./ocr-bridge/types";

export interface PhotoAdjustmentConfig {
  geometry: {
    enabled: boolean;
  };
  ocr: {
    enabled: boolean;
    language?: AppLanguage;
  };
}

export interface ProcessingResult {
  success: boolean;
  processedUri?: DataUrl;
  ocrResult?: OcrResult;
  error?: ProcessingError;
}

export interface ProcessingError {
  code: "PROCESSING_FAILED" | "OCR_FAILED";
  message: string;
}

export const DEFAULT_CONFIG: PhotoAdjustmentConfig = {
  geometry: {
    enabled: true,
  },
  ocr: {
    enabled: true,
  },
};

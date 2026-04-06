import type { DataUrl } from "@/lib/types/primitives";

export interface GeometryProcessingResult {
  success: boolean;
  processedUri?: DataUrl;
  error?: string;
}

export interface LightingProcessingResult {
  success: boolean;
  processedUri?: DataUrl;
  grayscaleUri?: DataUrl;
  error?: string;
}

export interface ClarityProcessingResult {
  success: boolean;
  processedUri?: DataUrl;
  error?: string;
}

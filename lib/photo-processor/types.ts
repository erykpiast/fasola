import type { DataUrl } from "@/lib/types/primitives";

/**
 * Basic configuration for OpenCV demo.
 */
export interface PhotoAdjustmentConfig {
  geometry: {
    enabled: boolean;
    minPageArea: number;
    padding: number;
  };
  debug?: {
    enabled: boolean;
  };
}

/**
 * Debug visualization data from basic edge detection.
 */
export interface DebugVisualizationData {
  edges?: DataUrl;
  imageWidth: number;
  imageHeight: number;
}

/**
 * Result of photo processing operation.
 */
export interface ProcessingResult {
  success: boolean;
  processedUri?: DataUrl;
  error?: ProcessingError;
  debug?: DebugVisualizationData;
}

/**
 * Error information from photo processing.
 */
export interface ProcessingError {
  code: "PROCESSING_FAILED";
  message: string;
}

/**
 * Default configuration for basic OpenCV demo.
 */
export const DEFAULT_ADJUSTMENT_CONFIG: PhotoAdjustmentConfig = {
  geometry: {
    enabled: true,
    minPageArea: 0.5,
    padding: 0.0,
  },
  debug: {
    enabled: true,
  },
};

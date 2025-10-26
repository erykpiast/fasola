import type { DataUrl } from "@/lib/types/primitives";

/**
 * Configuration for the photo adjustment engine.
 * Controls geometry correction, lighting normalization, and clarity enhancement.
 */
export interface PhotoAdjustmentConfig {
  geometry: {
    enabled: boolean;
    minPageArea: number; // 0.2-0.3 (20-30% of frame)
    padding: number; // 1-2%
  };
  lighting: {
    enabled: boolean;
    whiteBalance: "gray-world" | "simple" | "none";
    claheClipLimit: number; // 2.0-3.5
    claheTileSize: number; // 8
  };
  clarity: {
    enabled: boolean;
    denoiseStrength: number; // 3-7
    sharpenRadius: number; // 1.2-1.8
    sharpenAmount: number; // 0.8-1.4
    sharpenThreshold: number; // 2-4
  };
}

/**
 * Result of photo processing operation.
 */
export interface ProcessingResult {
  success: boolean;
  processedUri?: DataUrl;
  error?: ProcessingError;
}

/**
 * Error information from photo processing.
 */
export interface ProcessingError {
  code: "PROCESSING_FAILED";
  message: string;
}

/**
 * Default configuration for photo adjustment.
 * Uses conservative values for reliable processing.
 */
export const DEFAULT_ADJUSTMENT_CONFIG: PhotoAdjustmentConfig = {
  geometry: {
    enabled: false, // Will be enabled in Phase 1
    minPageArea: 0.25,
    padding: 0.02,
  },
  lighting: {
    enabled: false, // Will be enabled in Phase 2
    whiteBalance: "gray-world",
    claheClipLimit: 2.5,
    claheTileSize: 8,
  },
  clarity: {
    enabled: false, // Will be enabled in Phase 3
    denoiseStrength: 5,
    sharpenRadius: 1.5,
    sharpenAmount: 1.0,
    sharpenThreshold: 3,
  },
};

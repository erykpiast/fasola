import type { DataUrl } from "@/lib/types/primitives";
import type { OcrResult } from "./ocr-bridge/types";

// Core configuration for photo adjustment pipeline
export interface PhotoAdjustmentConfig {
  geometry: {
    enabled: boolean;
    // page-dewarp-js configuration options
    xMargin: number; // Horizontal page margin in pixels (default: 50, same as original)
    yMargin: number; // Vertical page margin in pixels (default: 20, same as original)
    outputZoom: number; // Output zoom factor (default: 1.0)
    noBinary: boolean; // Skip binary thresholding on output (default: true for recipe photos)
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
  ocr: {
    enabled: boolean;
  };
}

// Processing result from photo adjustment pipeline
export interface ProcessingResult {
  success: boolean;
  processedUri?: DataUrl;
  ocrResult?: OcrResult;
  error?: ProcessingError;
}

// Error types that can occur during processing
export interface ProcessingError {
  code:
    | "PROCESSING_FAILED"
    | "DEWARP_FAILED"
    | "NO_PAGE_DETECTED"
    | "LIGHTING_FAILED"
    | "CLARITY_FAILED"
    | "OCR_FAILED";
  message: string;
}

// Default configuration optimized for recipe photos
export const DEFAULT_CONFIG: PhotoAdjustmentConfig = {
  geometry: {
    enabled: true,
    xMargin: 50, // Match original page-dewarp-js default
    yMargin: 20, // Match original page-dewarp-js default
    outputZoom: 1.0,
    noBinary: true,
  },
  lighting: {
    enabled: true,
    whiteBalance: "gray-world",
    claheClipLimit: 2.5,
    claheTileSize: 8,
  },
  clarity: {
    enabled: true,
    denoiseStrength: 5,
    sharpenRadius: 1.5,
    sharpenAmount: 1.1,
    sharpenThreshold: 3,
  },
  ocr: {
    enabled: true,
  },
};

// Debug data from the dewarping pipeline
export interface DewarpDebugData {
  mathValidation?: {
    polynomialTest: boolean;
    projectionTest: boolean;
  };
  imageWidth: number;
  imageHeight: number;
  binaryText?: string;
  erodedText?: string;
  edgeMap?: string;
  detectedLines?: string;
  fittedLines?: string;
  pageBoundary?: string;
  spanEstimates?: string;
  detectedSpans?: string;
  keypointCloud?: string;
  preprocessingStats: {
    contoursFound: number;
    linesDetected: number;
    pageBounds: { width: number; height: number };
  };
  optimizationMetrics: {
    spanIterations: number;
    spanError: number;
    modelIterations: number;
    modelError: number;
    parameters: Array<number>;
  };
  meshGrid?: string;
  surfaceMesh?: string;
  beforeAfter?: string;
  remapStats: {
    resolution: { width: number; height: number };
    interpolation: string;
  };
  processingTime: number;
  progressLog?: Array<{
    phase: string;
    timestamp: number;
    message: string;
  }>;
}

export type DebugVisualizationData = DewarpDebugData;

// Message types for WebView bridge communication (native only)
export interface DewarpMessage {
  type: "dewarp" | "ready" | "result" | "error" | "log";
  id?: string;
  imageData?: string;
  config?: Partial<PhotoAdjustmentConfig["geometry"]>;
  result?: string;
  error?: string;
  message?: string;
}

import type { DataUrl } from "@/lib/types/primitives";

/**
 * Debug visualization data from basic edge detection.
 */
export interface DebugVisualizationData {
  edges?: DataUrl;
  imageWidth: number;
  imageHeight: number;
}

/**
 * Enhanced debug data for page dewarping.
 */
export interface DewarpDebugData extends DebugVisualizationData {
  mathValidation?: { polynomialTest: boolean; projectionTest: boolean };
  binaryText?: DataUrl;
  edgeMap?: DataUrl;
  detectedLines?: DataUrl;
  pageBoundary?: DataUrl;
  preprocessingStats: {
    contoursFound: number;
    linesDetected: number;
    pageBounds: { width: number; height: number };
  };
  detectedSpans?: DataUrl;
  keypointCloud?: DataUrl;
  optimizationMetrics: {
    spanIterations: number;
    spanError: number;
    modelIterations: number;
    modelError: number;
    parameters: Array<number>;
  };
  meshGrid?: DataUrl;
  beforeAfter?: DataUrl;
  surfaceMesh?: DataUrl;
  remapStats: {
    resolution: { width: number; height: number };
    interpolation: string;
  };
  processingTime: number;
  progressLog: Array<{ phase: string; timestamp: number; message: string }>;
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
interface ProcessingError {
  code: "PROCESSING_FAILED";
  message: string;
}

/**
 * Default configuration for basic OpenCV demo.
 */
export const DEFAULT_ADJUSTMENT_CONFIG: {
  geometry: {
    enabled: boolean;
    minPageArea: number;
    padding: number;
  };
  debug?: {
    enabled: boolean;
  };
} = {
  geometry: {
    enabled: true,
    minPageArea: 0.5,
    padding: 0.0,
  },
  debug: {
    enabled: true,
  },
};

/**
 * Default configuration for page dewarping.
 */
export const DEFAULT_DEWARP_CONFIG: {
  preprocessing: {
    edgeThresholdLow: number;
    edgeThresholdHigh: number;
    textDilationKernel: number;
  };
  spanDetection: {
    numSpans: number;
    spanSpacing: number;
  };
  modelFitting: {
    maxIterations: number;
    tolerance: number;
  };
  output: {
    width: number;
    height: number;
    adaptiveThreshold: boolean;
  };
} = {
  preprocessing: {
    edgeThresholdLow: 50,
    edgeThresholdHigh: 150,
    textDilationKernel: 3,
  },
  spanDetection: {
    numSpans: 10,
    spanSpacing: 50,
  },
  modelFitting: {
    maxIterations: 100,
    tolerance: 0.001,
  },
  output: {
    width: 1200,
    height: 1600,
    adaptiveThreshold: true,
  },
};

/**
 * Optimization Web Worker
 * Runs CPU-intensive pure-JavaScript optimization functions off the main thread.
 * Handles contour density computation, span refinement, keypoint collection, and cubic sheet fitting.
 */

import { DEFAULT_DEWARP_CONFIG } from "../config";
import type {
  CubicSheetParams,
  DewarpProgressCallback,
  Point2D,
  SpanParams,
} from "../pipelines/geometry/page-dewarp-core";
import {
  collectKeypointsFromSpans,
  fitCubicSheet,
  refineSpans,
} from "./dewarp-optimizer";

interface OptimizationRequest {
  type: "optimize";
  requestId: string;
  contours: Array<{ x: number; y: number; width: number; height: number }>;
  spanEstimates: Array<SpanParams>;
  imageWidth: number;
  imageHeight: number;
  kernelSize: number;
}

interface OptimizationResult {
  type: "optimization-result";
  requestId: string;
  success: boolean;
  params?: CubicSheetParams;
  spans?: Array<SpanParams>;
  keypoints?: Array<Point2D>;
  error?: string;
}

interface ProgressMessage {
  type: "progress";
  requestId: string;
  phase: string;
  progress: number;
  message: string;
}

/**
 * Run the full optimization pipeline.
 */
async function runOptimization(request: OptimizationRequest): Promise<void> {
  const {
    requestId,
    contours,
    spanEstimates,
    imageWidth,
    imageHeight,
    kernelSize,
  } = request;

  try {
    console.log("[Optimization Worker] Starting optimization pipeline");

    // Create progress callback that sends messages back to main thread
    const progressCallback: DewarpProgressCallback = (
      phase,
      progress,
      message
    ) => {
      const progressMsg: ProgressMessage = {
        type: "progress",
        requestId,
        phase,
        progress,
        message,
      };
      self.postMessage(progressMsg);
    };

    // Step 1: Refine spans using contour density
    progressCallback("Optimization", 30, "Refining text line spans");
    const spanResult = refineSpans(
      spanEstimates,
      contours,
      imageWidth,
      imageHeight,
      kernelSize,
      progressCallback
    );

    // Step 3: Collect keypoints
    progressCallback("Optimization", 40, "Collecting keypoints");
    const keypoints = collectKeypointsFromSpans(
      spanResult.spans,
      imageWidth,
      20
    );

    // Step 4: Fit cubic sheet model
    progressCallback("Model Fitting", 45, "Fitting 3D page model");
    const sheetResult = fitCubicSheet(
      keypoints,
      imageWidth,
      imageHeight,
      DEFAULT_DEWARP_CONFIG.modelFitting,
      progressCallback
    );

    // Send successful result
    const result: OptimizationResult = {
      type: "optimization-result",
      requestId,
      success: true,
      params: sheetResult.params,
      spans: spanResult.spans,
      keypoints,
    };

    self.postMessage(result);
    console.log("[Optimization Worker] Optimization completed successfully");
  } catch (error) {
    console.error("[Optimization Worker] Optimization failed:", error);
    const result: OptimizationResult = {
      type: "optimization-result",
      requestId,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
    self.postMessage(result);
  }
}

/**
 * Message handler for requests from the main thread.
 */
self.addEventListener("message", (event: MessageEvent) => {
  const message = event.data;

  if (message.type === "optimize") {
    runOptimization(message as OptimizationRequest);
  }
});

// Worker is ready
console.log("[Optimization Worker] Worker initialized and ready");

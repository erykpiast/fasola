/**
 * Optimization worker loader for web platform.
 * Runs CPU-intensive pure-JavaScript optimization functions in a Web Worker.
 * Falls back to main thread if worker initialization fails.
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
// @ts-expect-error - Metro transformer bundles this as a string, not the actual module
import workerCode from "./worker";

interface OptimizationRequest {
  contours: Array<{ x: number; y: number; width: number; height: number }>;
  spanEstimates: Array<SpanParams>;
  imageWidth: number;
  imageHeight: number;
  kernelSize: number;
  progressCallback?: DewarpProgressCallback;
}

interface OptimizationResult {
  params: CubicSheetParams;
  spans: Array<SpanParams>;
  keypoints: Array<Point2D>;
}

let worker: Worker | null = null;
let workerReady = false;
let nextRequestId = 0;
const pendingRequests = new Map<
  string,
  {
    resolve: (result: OptimizationResult) => void;
    reject: (error: Error) => void;
    progressCallback?: DewarpProgressCallback;
  }
>();

/**
 * Check if Web Workers are supported in the current environment.
 */
function isWorkerSupported(): boolean {
  return typeof Worker !== "undefined" && typeof window !== "undefined";
}

/**
 * Initialize Optimization Web Worker.
 */
function initializeWorker(): void {
  if (!isWorkerSupported() || worker) {
    return;
  }

  try {
    const blob = new Blob([workerCode as unknown as string], {
      type: "application/javascript",
    });
    const workerUrl = URL.createObjectURL(blob);
    worker = new Worker(workerUrl);

    worker.onmessage = (event: MessageEvent) => {
      const message = event.data;

      if (message.type === "optimization-result") {
        const pending = pendingRequests.get(message.requestId);
        if (pending) {
          pendingRequests.delete(message.requestId);
          if (message.success) {
            pending.resolve({
              params: message.params,
              spans: message.spans,
              keypoints: message.keypoints,
            });
          } else {
            pending.reject(new Error(message.error || "Optimization failed"));
          }
        }
      } else if (message.type === "progress") {
        const pending = pendingRequests.get(message.requestId);
        if (pending && pending.progressCallback) {
          pending.progressCallback(
            message.phase,
            message.progress,
            message.message
          );
        }
      }
    };

    worker.onerror = (error: ErrorEvent) => {
      console.error("[Optimization Worker] Worker error:", error);
      worker = null;
      workerReady = false;
    };

    workerReady = true;
    console.log("[Optimization Worker] Worker initialized successfully");
  } catch (error) {
    console.warn(
      "[Optimization Worker] Failed to initialize worker, will fall back to main thread:",
      error
    );
    worker = null;
    workerReady = false;
  }
}

/**
 * Run optimization in worker or fall back to main thread.
 */
export async function runOptimization(
  request: OptimizationRequest
): Promise<OptimizationResult> {
  // Try to initialize worker if not already done
  if (!worker && !workerReady) {
    initializeWorker();
  }

  // Use worker if available
  if (worker && workerReady) {
    return runOptimizationInWorker(request);
  }

  // Fall back to main thread
  console.log("[Optimization Worker] Running optimization on main thread");
  return runOptimizationOnMainThread(request);
}

/**
 * Run optimization in the Web Worker.
 */
function runOptimizationInWorker(
  request: OptimizationRequest
): Promise<OptimizationResult> {
  if (!worker || !workerReady) {
    throw new Error("Worker not ready");
  }

  const requestId = `req_${nextRequestId++}`;

  return new Promise((resolve, reject) => {
    pendingRequests.set(requestId, {
      resolve,
      reject,
      progressCallback: request.progressCallback,
    });

    worker!.postMessage({
      type: "optimize",
      requestId,
      contours: request.contours,
      spanEstimates: request.spanEstimates,
      imageWidth: request.imageWidth,
      imageHeight: request.imageHeight,
      kernelSize: request.kernelSize,
    });

    // Timeout after 60 seconds
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error("Optimization timeout"));
      }
    }, 60000);
  });
}

/**
 * Run optimization on the main thread (fallback).
 */
function runOptimizationOnMainThread(
  request: OptimizationRequest
): Promise<OptimizationResult> {
  return new Promise((resolve, reject) => {
    try {
      const {
        contours,
        spanEstimates,
        imageWidth,
        imageHeight,
        kernelSize,
        progressCallback,
      } = request;

      // Step 1: Refine spans using contour density
      progressCallback?.("Optimization", 30, "Refining text line spans");
      const spanResult = refineSpans(
        spanEstimates,
        contours,
        imageWidth,
        imageHeight,
        kernelSize,
        progressCallback
      );

      // Step 3: Collect keypoints
      progressCallback?.("Optimization", 40, "Collecting keypoints");
      const keypoints = collectKeypointsFromSpans(
        spanResult.spans,
        imageWidth,
        20
      );

      // Step 4: Fit cubic sheet model
      progressCallback?.("Model Fitting", 45, "Fitting 3D page model");
      const sheetResult = fitCubicSheet(
        keypoints,
        imageWidth,
        imageHeight,
        DEFAULT_DEWARP_CONFIG.modelFitting,
        progressCallback
      );

      resolve({
        params: sheetResult.params,
        spans: spanResult.spans,
        keypoints,
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Page dewarping pipeline using OpenCV.js and optimization libraries.
 * Implements the full cubic sheet model for flattening curved pages.
 *
 * PIPELINE ORCHESTRATION:
 * ======================
 * This is the main entry point that coordinates all phases of the dewarping algorithm.
 *
 * The complete pipeline:
 *
 * 1. INITIALIZATION (0-5%)
 *    - Validate mathematical functions
 *    - Set up progress tracking
 *
 * 2. PREPROCESSING (5-25%)
 *    - Adaptive thresholding → binary text
 *    - Canny edge detection → edge map
 *    - Morphological operations → connected components
 *    - Hough line detection → initial text line estimates
 *    - Contour detection → page boundary
 *
 * 3. SPAN DETECTION (25-40%)
 *    - Compute edge density map (smoothed edge information)
 *    - Extract initial span estimates from Hough lines
 *    - Refine spans using gradient descent (50 iterations)
 *    - Each span has position + curvature parameters
 *
 * 4. MODEL FITTING (40-70%)
 *    - Sample keypoints along refined spans
 *    - Fit 16-parameter cubic sheet model
 *    - Use Levenberg-Marquardt optimization (up to 100 iterations)
 *    - Minimize reprojection error of keypoints
 *
 * 5. REMAPPING (70-95%)
 *    - Generate transformation maps (mapX, mapY)
 *    - For each output pixel, compute source location in input
 *    - Apply remap with cubic interpolation
 *    - Optional: adaptive threshold for clean text output
 *
 * 6. FINALIZATION (95-100%)
 *    - Generate debug visualizations (if enabled)
 *    - Collect processing metrics
 *    - Return dewarped image
 *
 * Error handling:
 * - If any phase fails, return original image (graceful degradation)
 * - Log errors for debugging
 * - Populate debug data with partial results
 *
 * Progress reporting:
 * - Each phase reports progress 0-100 with descriptive messages
 * - Allows UI to show real-time feedback to user
 */

import { Mat } from "@techstark/opencv-js";
import { DEFAULT_DEWARP_CONFIG } from "../config";
import type { OpenCVPreprocessing } from "../opencv";
import { runOptimization } from "../../optimization/loader.web";
import type { DewarpDebugData } from "../types";
import { reportPhaseInit, validateMathFunctions } from "./page-dewarp-core";
import type { OpenCVRemap } from "./page-dewarp-remap";
import {
  applyDewarp,
  generateDewarpMaps,
  generateRemapDebugData,
} from "./page-dewarp-remap";
import {
  extractSpanEstimatesFromContours,
  preprocessImage,
  visualizeDetectedSpans,
  visualizeKeypointCloud,
  visualizeSpanEstimates,
} from "./preprocessing";

/**
 * Apply page dewarping to straighten curved pages.
 * Uses cubic sheet model and optimization to flatten warped text.
 */
export async function applyGeometryCorrection(
  cv: OpenCVPreprocessing & OpenCVRemap,
  src: Mat,
  collectDebugData: boolean = false
): Promise<{ mat: Mat | null; debug?: DewarpDebugData }> {
  const startTime = Date.now();
  const progressLog: Array<{
    phase: string;
    timestamp: number;
    message: string;
  }> = [];

  const logProgress = (
    phase: string,
    progress: number,
    message: string
  ): void => {
    progressLog.push({
      phase,
      timestamp: Date.now() - startTime,
      message,
    });
    console.info(phase, progress, message);
  };

  try {
    reportPhaseInit(logProgress);
    const mathValidation = validateMathFunctions();

    logProgress("Preprocessing", 5, "Starting preprocessing");

    const result = await preprocessImage(
      cv,
      src,
      {
        adaptiveWindowSize:
          DEFAULT_DEWARP_CONFIG.preprocessing.adaptiveThresholdBlockSize,
        textMinWidth: DEFAULT_DEWARP_CONFIG.preprocessing.textMinWidth,
        textMinHeight: DEFAULT_DEWARP_CONFIG.preprocessing.textMinHeight,
        textMinAspect: DEFAULT_DEWARP_CONFIG.preprocessing.textMinAspect,
        textMaxThickness: DEFAULT_DEWARP_CONFIG.preprocessing.textMaxThickness,
        pageMinAreaRatio: DEFAULT_DEWARP_CONFIG.preprocessing.pageMinAreaRatio,
        pageMinAspectRatio:
          DEFAULT_DEWARP_CONFIG.preprocessing.pageMinAspectRatio,
        pageMaxAspectRatio:
          DEFAULT_DEWARP_CONFIG.preprocessing.pageMaxAspectRatio,
      },
      collectDebugData,
      logProgress
    );

    const preprocessingDebugData = result.debugData;

    const spanEstimates = extractSpanEstimatesFromContours(
      result.textContours,
      src.rows,
      DEFAULT_DEWARP_CONFIG.spanDetection.numSpans
    );

    logProgress("Optimization", 25, "Running optimization in worker");

    // Extract contour rectangles for optimization
    const contours = result.textContours.map((tc) => tc.rect);

    // Run optimization in worker (or main thread as fallback)
    const optimizationResult = await runOptimization({
      contours,
      spanEstimates,
      imageWidth: src.cols,
      imageHeight: src.rows,
      kernelSize: 5,
      progressCallback: logProgress,
    });

    const spanResult = {
      spans: optimizationResult.spans,
      iterations: 0,
      error: 0,
    };

    const sheetResult = {
      params: optimizationResult.params,
      iterations: 0,
      error: 0,
    };
    const keypoints = optimizationResult.keypoints;

    logProgress("Remapping", 70, "Generating transformation maps");

    const { mapX, mapY } = generateDewarpMaps(
      cv,
      sheetResult.params,
      src.cols,
      src.rows,
      DEFAULT_DEWARP_CONFIG.output.width,
      DEFAULT_DEWARP_CONFIG.output.height,
      logProgress
    );

    logProgress("Remapping", 85, "Applying dewarping");

    const dewarped = applyDewarp(
      cv,
      src,
      mapX,
      mapY,
      DEFAULT_DEWARP_CONFIG.output.adaptiveThreshold,
      logProgress
    );

    logProgress("Finalizing", 95, "Generating debug data");

    let debugData: DewarpDebugData | undefined;

    if (collectDebugData) {
      const remapDebugData = generateRemapDebugData(
        cv,
        src,
        dewarped,
        sheetResult.params,
        mapX,
        mapY,
        collectDebugData
      );

      debugData = {
        mathValidation,
        imageWidth: src.cols,
        imageHeight: src.rows,
        ...preprocessingDebugData,
        spanEstimates: visualizeSpanEstimates(cv, src, spanEstimates),
        detectedSpans: visualizeDetectedSpans(cv, src, spanResult.spans),
        keypointCloud: visualizeKeypointCloud(cv, src, keypoints),
        preprocessingStats: preprocessingDebugData?.preprocessingStats || {
          contoursFound: 0,
          linesDetected: 0,
          pageBounds: { width: 0, height: 0 },
        },
        optimizationMetrics: {
          spanIterations: spanResult.iterations,
          spanError: spanResult.error,
          modelIterations: sheetResult.iterations,
          modelError: sheetResult.error,
          parameters: sheetResult.params.coefficients,
        },
        ...remapDebugData,
        remapStats: remapDebugData?.remapStats || {
          resolution: { width: 0, height: 0 },
          interpolation: "INTER_CUBIC",
        },
        processingTime: Date.now() - startTime,
        progressLog,
      };
    }

    // Clean up temporary Mats after debug data generation
    mapX.delete();
    mapY.delete();

    logProgress(
      "Complete",
      100,
      `Processing complete in ${Date.now() - startTime}ms`
    );

    console.log(
      `[Page Dewarp] Processing complete in ${Date.now() - startTime}ms`
    );

    return { mat: dewarped, debug: debugData };
  } catch (error) {
    console.error("[Page Dewarp] Error during processing:", error);

    logProgress("Error", 0, `Processing failed: ${error}`);

    return {
      mat: src,
      debug: collectDebugData
        ? {
            imageWidth: src.cols,
            imageHeight: src.rows,
            preprocessingStats: {
              contoursFound: 0,
              linesDetected: 0,
              pageBounds: { width: 0, height: 0 },
            },
            optimizationMetrics: {
              spanIterations: 0,
              spanError: 0,
              modelIterations: 0,
              modelError: 0,
              parameters: [],
            },
            remapStats: {
              resolution: { width: 0, height: 0 },
              interpolation: "INTER_CUBIC",
            },
            processingTime: Date.now() - startTime,
            progressLog,
          }
        : undefined,
    };
  }
}

/**
 * Load an image from URI into an OpenCV Mat.
 * @param cv - OpenCV instance
 * @param imageUri - The image URI (data URL or file path)
 * @returns Promise resolving to OpenCV Mat
 */
export function loadImageToMat(
  cv: { matFromImageData: (imageData: ImageData) => Mat },
  imageUri: string
): Promise<Mat> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const mat = cv.matFromImageData(imageData);

        resolve(mat);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = (error) => {
      let errorMsg: string;
      // Try to extract useful information from typical Image error/event objects.
      if (error instanceof Error) {
        errorMsg = error.message;
      } else if (
        error &&
        typeof error === "object" &&
        "type" in error &&
        "target" in error
      ) {
        // Likely an Event (e.g., Event from <img> onerror)
        const evt = error as Event & {
          target?: EventTarget & { src?: string };
        };
        const src =
          evt?.target && "src" in evt.target
            ? (evt.target as any).src
            : undefined;
        errorMsg = `Event type: ${evt.type}${src ? `, image src: ${src}` : ""}`;
      } else {
        errorMsg = String(error);
      }
      reject(new Error(`Failed to load image: ${errorMsg}`));
    };

    img.src = imageUri;
  });
}

/**
 * Convert an OpenCV Mat to a data URL.
 * @param cv - OpenCV instance
 * @param mat - OpenCV Mat
 * @param quality - JPEG quality (0-1)
 * @returns Data URL string
 */
export function matToDataUrl(
  cv: { imshow: (canvas: HTMLCanvasElement, mat: Mat) => void },
  mat: Mat,
  quality: number = 0.92
): string {
  const canvas = document.createElement("canvas");
  cv.imshow(canvas, mat);
  return canvas.toDataURL("image/jpeg", quality);
}

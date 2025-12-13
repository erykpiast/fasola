/**
 * Main preprocessing pipeline for page dewarping.
 *
 * PREPROCESSING PHASE EXPLAINED:
 * ==============================
 * Before we can fit a 3D model to the page, we need to extract features
 * from the photograph that tell us about the page's structure.
 *
 * Steps in this phase:
 * 1. ADAPTIVE THRESHOLDING: Convert to white text on black background (inverted)
 *    - Handles varying lighting conditions across the page
 *    - Works better than global thresholding for photos
 *    - Inverted output required for morphological operations to work correctly
 *
 * 2. MORPHOLOGICAL OPERATIONS: Connect nearby edges
 *    - Dilation expands edge regions to connect nearby features
 *    - Helps identify continuous text regions
 *
 * 3. CONTOUR DETECTION: Find closed shapes in the image
 *    - The page boundary is typically the largest contour
 *    - Helps us focus processing on the actual page area
 *
 * 4. LINE FITTING: Fit lines to text contours
 *    - Text lines appear as approximately straight lines in the image
 *    - Even on curved pages, locally they look straight
 *    - These give us initial estimates for text span positions
 *
 * Output: Edge map, detected lines, and initial span estimates
 * These feed into the optimization phase.
 *
 * Reference: https://github.com/mzucker/page_dewarp/blob/master/page_dewarp.py
 */

import type { OpenCVPreprocessing } from "@/lib/photo-processor/opencv";
import type { Mat } from "@techstark/opencv-js";
import type { DewarpProgressCallback, Point2D } from "../page-dewarp-core";
import { extractAllContours, filterTextContours } from "./contour-detection";
import { generatePreprocessingDebugData } from "./debug-visualization";
import {
  applyAdaptiveThreshold,
  connectTextIntoLines,
  convertToGrayscale,
} from "./image-processing";
import {
  findPageBounds,
  fitLinesToContours,
  mergeNearbyLines,
  type PageBounds,
} from "./line-fitting";
import { yieldToMainThread } from "./utils";

export {
  visualizeDetectedSpans,
  visualizeKeypointCloud,
} from "./debug-visualization";
export {
  extractSpanEstimates,
  extractSpanEstimatesFromContours,
  visualizeSpanEstimates,
} from "./span-estimation";

/**
 * Preprocessing based on Matt Zucker's page_dewarp.py implementation.
 *
 * This approach:
 * - Uses adaptive threshold windows for binary image conversion
 * - Detects text contours directly instead of using Hough lines
 * - Filters contours based on geometric properties (size, aspect ratio, thickness)
 * - Extracts text regions rather than edge-based line detection
 */
export async function preprocessImage(
  cv: OpenCVPreprocessing,
  src: Mat,
  config: {
    adaptiveWindowSize: number;
    textMinWidth: number;
    textMinHeight: number;
    textMinAspect: number;
    textMaxThickness: number;
    pageMinAreaRatio: number;
    pageMinAspectRatio: number;
    pageMaxAspectRatio: number;
  },
  collectDebugData: boolean = false,
  progressCallback?: DewarpProgressCallback
): Promise<{
  contours: Array<Array<Point2D>>;
  textContours: Array<{
    rect: { x: number; y: number; width: number; height: number };
    points: Array<Point2D>;
  }>;
  pageBounds: PageBounds;
  debugData: ReturnType<typeof generatePreprocessingDebugData> | null;
}> {
  let gray: Mat | null = null;
  let binary: Mat | null = null;
  let processedBinary: Mat | null = null;
  let allContours = null;
  let hierarchy: Mat | null = null;

  try {
    progressCallback?.("Preprocessing", 5, "Converting to grayscale");
    gray = convertToGrayscale(cv, src);
    await yieldToMainThread();

    progressCallback?.("Preprocessing", 10, "Applying adaptive threshold");
    binary = applyAdaptiveThreshold(cv, gray, config.adaptiveWindowSize);
    await yieldToMainThread();

    progressCallback?.("Preprocessing", 12, "Finding page bounds");
    const pageBoundsResult = extractAllContours(cv, binary);
    const pageBounds = findPageBounds(
      cv,
      pageBoundsResult.contours,
      src.cols,
      src.rows,
      {
        minAreaRatio: config.pageMinAreaRatio,
        minAspectRatio: config.pageMinAspectRatio,
        maxAspectRatio: config.pageMaxAspectRatio,
      }
    );
    pageBoundsResult.contours.delete();
    pageBoundsResult.hierarchy.delete();
    await yieldToMainThread();

    progressCallback?.(
      "Preprocessing",
      15,
      "Applying morphological operations"
    );
    processedBinary = connectTextIntoLines(cv, binary);
    await yieldToMainThread();

    progressCallback?.("Preprocessing", 20, "Finding text contours");
    const contoursResult = extractAllContours(cv, processedBinary);
    allContours = contoursResult.contours;
    hierarchy = contoursResult.hierarchy;
    await yieldToMainThread();

    progressCallback?.("Preprocessing", 25, "Filtering text contours");
    const { allContoursArray, textContours, rejectedContours } =
      filterTextContours(cv, allContours, config);

    progressCallback?.("Preprocessing", 28, "Fitting lines to contours");
    const textContoursWithLines = fitLinesToContours(cv, textContours);
    await yieldToMainThread();

    progressCallback?.("Preprocessing", 29, "Merging nearby line segments");
    const mergedLines = mergeNearbyLines(cv, textContoursWithLines);
    await yieldToMainThread();

    progressCallback?.(
      "Preprocessing",
      30,
      `Found ${mergedLines.length} merged text lines (from ${textContours.length} contours)`
    );

    let debugData = null;
    if (collectDebugData) {
      debugData = generatePreprocessingDebugData(
        cv,
        src,
        gray,
        binary,
        processedBinary,
        allContoursArray,
        textContours,
        rejectedContours,
        mergedLines,
        pageBounds
      );
    }

    return {
      contours: allContoursArray,
      textContours: mergedLines,
      pageBounds,
      debugData,
    };
  } finally {
    gray?.delete();
    binary?.delete();
    processedBinary?.delete();
    allContours?.delete();
    hierarchy?.delete();
  }
}

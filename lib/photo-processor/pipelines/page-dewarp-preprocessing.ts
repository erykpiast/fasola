/**
 * OpenCV preprocessing pipeline for page dewarping.
 * Handles edge detection, text line detection, and contour extraction.
 *
 * PREPROCESSING PHASE EXPLAINED:
 * ==============================
 * Before we can fit a 3D model to the page, we need to extract features
 * from the photograph that tell us about the page's structure.
 *
 * Steps in this phase:
 * 1. ADAPTIVE THRESHOLDING: Convert to black text on white background
 *    - Handles varying lighting conditions across the page
 *    - Works better than global thresholding for photos
 *
 * 2. EDGE DETECTION: Find strong gradients (edges) in the image
 *    - Canny edge detector finds both horizontal and vertical edges
 *    - Text creates many horizontal edges (top/bottom of letters)
 *
 * 3. MORPHOLOGICAL OPERATIONS: Connect nearby edges
 *    - Dilation expands edge regions to connect nearby features
 *    - Helps identify continuous text regions
 *
 * 4. CONTOUR DETECTION: Find closed shapes in the image
 *    - The page boundary is typically the largest contour
 *    - Helps us focus processing on the actual page area
 *
 * 5. HOUGH LINE DETECTION: Find straight(-ish) lines
 *    - Text lines appear as approximately straight lines in the image
 *    - Even on curved pages, locally they look straight
 *    - These give us initial estimates for text span positions
 *
 * Output: Edge map, detected lines, and initial span estimates
 * These feed into the optimization phase.
 */

import type { DataUrl } from "@/lib/types/primitives";
import type { Mat } from "@techstark/opencv-js";
import type {
  DewarpProgressCallback,
  Point2D,
  SpanParams,
} from "./page-dewarp-core";

/**
 * Preprocessing statistics.
 */
export interface PreprocessingStats {
  contoursFound: number;
  linesDetected: number;
  pageBounds: { width: number; height: number };
}

/**
 * Preprocessing debug outputs.
 */
export interface PreprocessingDebugData {
  binaryText?: DataUrl;
  edgeMap?: DataUrl;
  detectedLines?: DataUrl;
  pageBoundary?: DataUrl;
  preprocessingStats: PreprocessingStats;
}

/**
 * Preprocessing result containing processed Mat and debug data.
 */
export interface PreprocessingResult {
  edgeMat: Mat;
  contours: Array<Array<Point2D>>;
  lines: Array<{ start: Point2D; end: Point2D }>;
  pageBounds: { x: number; y: number; width: number; height: number };
  debugData?: PreprocessingDebugData;
}

/**
 * OpenCV interface for preprocessing operations.
 */
export interface OpenCVPreprocessing {
  Mat: new () => Mat;
  MatVector: new () => any;
  cvtColor: (src: Mat, dst: Mat, code: number) => void;
  adaptiveThreshold: (
    src: Mat,
    dst: Mat,
    maxValue: number,
    adaptiveMethod: number,
    thresholdType: number,
    blockSize: number,
    C: number
  ) => void;
  Canny: (src: Mat, dst: Mat, threshold1: number, threshold2: number) => void;
  dilate: (src: Mat, dst: Mat, kernel: Mat) => void;
  erode: (src: Mat, dst: Mat, kernel: Mat) => void;
  findContours: (
    image: Mat,
    contours: any,
    hierarchy: Mat,
    mode: number,
    method: number
  ) => void;
  HoughLinesP: (
    image: Mat,
    lines: Mat,
    rho: number,
    theta: number,
    threshold: number,
    minLineLength: number,
    maxLineGap: number
  ) => void;
  boundingRect: (contour: any) => {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  getStructuringElement: (shape: number, size: any) => Mat;
  imshow: (canvas: HTMLCanvasElement, mat: Mat) => void;
  line: (
    img: Mat,
    pt1: Point2D,
    pt2: Point2D,
    color: any,
    thickness?: number
  ) => void;
  rectangle: (
    img: Mat,
    pt1: Point2D,
    pt2: Point2D,
    color: any,
    thickness?: number
  ) => void;
  COLOR_RGBA2GRAY: number;
  ADAPTIVE_THRESH_GAUSSIAN_C: number;
  THRESH_BINARY: number;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_SIMPLE: number;
  MORPH_RECT: number;
  Size: new (width: number, height: number) => any;
  Scalar: new (...values: Array<number>) => any;
}

/**
 * Preprocess image for page dewarping.
 */
export function preprocessImage(
  cv: OpenCVPreprocessing,
  src: Mat,
  config: {
    edgeThresholdLow: number;
    edgeThresholdHigh: number;
    textDilationKernel: number;
  },
  collectDebugData: boolean = false,
  progressCallback?: DewarpProgressCallback
): PreprocessingResult {
  const gray = new cv.Mat();
  const binary = new cv.Mat();
  const edges = new cv.Mat();
  const dilated = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const lines = new cv.Mat();

  try {
    if (progressCallback) {
      progressCallback("Preprocessing", 5, "Converting to grayscale");
    }

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    if (progressCallback) {
      progressCallback("Preprocessing", 10, "Applying adaptive thresholding");
    }

    cv.adaptiveThreshold(
      gray,
      binary,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      11,
      2
    );

    if (progressCallback) {
      progressCallback("Preprocessing", 15, "Detecting edges");
    }

    cv.Canny(gray, edges, config.edgeThresholdLow, config.edgeThresholdHigh);

    if (progressCallback) {
      progressCallback(
        "Preprocessing",
        18,
        "Applying morphological operations"
      );
    }

    const kernel = cv.getStructuringElement(
      cv.MORPH_RECT,
      new cv.Size(config.textDilationKernel, config.textDilationKernel)
    );
    cv.dilate(edges, dilated, kernel);
    kernel.delete();

    if (progressCallback) {
      progressCallback("Preprocessing", 20, "Finding contours");
    }

    cv.findContours(
      dilated,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    );

    if (progressCallback) {
      progressCallback("Preprocessing", 22, "Detecting text lines");
    }

    cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 50, 50, 10);

    const contoursArray: Array<Array<Point2D>> = [];
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const points: Array<Point2D> = [];

      for (let j = 0; j < contour.data32S.length; j += 2) {
        points.push({
          x: contour.data32S[j],
          y: contour.data32S[j + 1],
        });
      }

      contoursArray.push(points);
    }

    const linesArray: Array<{ start: Point2D; end: Point2D }> = [];
    for (let i = 0; i < lines.rows; i++) {
      linesArray.push({
        start: { x: lines.data32S[i * 4], y: lines.data32S[i * 4 + 1] },
        end: { x: lines.data32S[i * 4 + 2], y: lines.data32S[i * 4 + 3] },
      });
    }

    let pageBounds = { x: 0, y: 0, width: src.cols, height: src.rows };
    if (contours.size() > 0) {
      let maxArea = 0;
      for (let i = 0; i < contours.size(); i++) {
        const rect = cv.boundingRect(contours.get(i));
        const area = rect.width * rect.height;
        if (area > maxArea) {
          maxArea = area;
          pageBounds = rect;
        }
      }
    }

    if (progressCallback) {
      progressCallback(
        "Preprocessing",
        25,
        `Found ${contoursArray.length} contours and ${linesArray.length} lines`
      );
    }

    let debugData: PreprocessingDebugData | undefined;

    if (collectDebugData) {
      debugData = {
        binaryText: matToDataUrl(cv, binary),
        edgeMap: matToDataUrl(cv, edges),
        detectedLines: visualizeLines(cv, src, linesArray),
        pageBoundary: visualizeBoundary(cv, src, pageBounds),
        preprocessingStats: {
          contoursFound: contoursArray.length,
          linesDetected: linesArray.length,
          pageBounds: { width: pageBounds.width, height: pageBounds.height },
        },
      };
    }

    return {
      edgeMat: edges.clone(),
      contours: contoursArray,
      lines: linesArray,
      pageBounds,
      debugData,
    };
  } finally {
    gray.delete();
    binary.delete();
    edges.delete();
    dilated.delete();
    contours.delete();
    hierarchy.delete();
    lines.delete();
  }
}

/**
 * Extract initial span estimates from detected lines.
 *
 * INITIAL SPAN ESTIMATION:
 * =======================
 * From the lines detected by Hough transform, we need to extract rough
 * positions for horizontal text spans.
 *
 * Algorithm:
 * 1. Filter to approximately horizontal lines (angle < 30°)
 * 2. Sort lines by vertical position (top to bottom)
 * 3. Divide the page into numSpans regions
 * 4. For each region, find the closest detected line
 * 5. Use that line's position as the initial span estimate
 *
 * Why this approach?
 * - Hough lines give us real detected features (not just guesses)
 * - Horizontal filtering ensures we're looking at text, not page edges
 * - Even spacing ensures we sample across the whole page
 * - These estimates will be refined by optimization later
 *
 * Fallback: If no lines detected in a region, we use evenly-spaced positions.
 * This ensures we always have span estimates to work with.
 */
export function extractSpanEstimates(
  lines: Array<{ start: Point2D; end: Point2D }>,
  imageWidth: number,
  imageHeight: number,
  numSpans: number
): Array<SpanParams> {
  const horizontalLines = lines.filter((line) => {
    const angle = Math.abs(
      Math.atan2(line.end.y - line.start.y, line.end.x - line.start.x)
    );
    return angle < Math.PI / 6 || angle > (5 * Math.PI) / 6;
  });

  horizontalLines.sort((a, b) => {
    const yA = (a.start.y + a.end.y) / 2;
    const yB = (b.start.y + b.end.y) / 2;
    return yA - yB;
  });

  const spans: Array<SpanParams> = [];
  const step = imageHeight / (numSpans + 1);

  for (let i = 0; i < numSpans; i++) {
    const targetY = step * (i + 1);

    let closestLine = horizontalLines.find((line) => {
      const lineY = (line.start.y + line.end.y) / 2;
      return Math.abs(lineY - targetY) < step / 2;
    });

    if (!closestLine && horizontalLines.length > 0) {
      closestLine = horizontalLines[Math.min(i, horizontalLines.length - 1)];
    }

    const yPosition = closestLine
      ? (closestLine.start.y + closestLine.end.y) / 2
      : targetY;

    spans.push({
      yPosition,
      curvature: 0,
    });
  }

  return spans;
}

/**
 * Convert Mat to data URL.
 */
function matToDataUrl(cv: OpenCVPreprocessing, mat: Mat): DataUrl {
  const canvas = document.createElement("canvas");
  cv.imshow(canvas, mat);
  return canvas.toDataURL("image/png") as DataUrl;
}

/**
 * Visualize detected lines on source image.
 */
function visualizeLines(
  cv: OpenCVPreprocessing,
  src: Mat,
  lines: Array<{ start: Point2D; end: Point2D }>
): DataUrl {
  const visualization = src.clone();
  const color = new cv.Scalar(0, 255, 0, 255);

  for (const line of lines) {
    cv.line(visualization, line.start, line.end, color, 2);
  }

  const result = matToDataUrl(cv, visualization);
  visualization.delete();

  return result;
}

/**
 * Visualize page boundary on source image.
 */
function visualizeBoundary(
  cv: OpenCVPreprocessing,
  src: Mat,
  bounds: { x: number; y: number; width: number; height: number }
): DataUrl {
  const visualization = src.clone();
  const color = new cv.Scalar(255, 0, 0, 255);

  cv.rectangle(
    visualization,
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    color,
    3
  );

  const result = matToDataUrl(cv, visualization);
  visualization.delete();

  return result;
}

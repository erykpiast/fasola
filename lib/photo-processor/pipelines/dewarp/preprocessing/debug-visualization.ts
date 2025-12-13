/**
 * Debug visualization functions for preprocessing.
 */

import type { OpenCVPreprocessing } from "@/lib/photo-processor/opencv";
import type { DataUrl } from "@/lib/types/primitives";
import type { Mat } from "@techstark/opencv-js";
import {
  sampleKeypointsOnSpan,
  type Point2D,
  type SpanParams,
} from "../page-dewarp-core";
import type { PageBounds } from "./line-fitting";

/**
 * Convert Mat to data URL.
 */
function matToDataUrl(cv: OpenCVPreprocessing, mat: Mat): DataUrl {
  const canvas = document.createElement("canvas");
  cv.imshow(canvas, mat);
  return canvas.toDataURL("image/png") as DataUrl;
}

/**
 * Visualize page boundary on source image.
 */
function visualizeBoundary(
  cv: OpenCVPreprocessing,
  src: Mat,
  bounds: PageBounds
): DataUrl {
  const visualization = new cv.Mat();
  src.copyTo(visualization);
  const rectColor = new cv.Scalar(255, 0, 0, 255);

  cv.rectangle(
    visualization,
    { x: bounds.rect.x, y: bounds.rect.y },
    {
      x: bounds.rect.x + bounds.rect.width,
      y: bounds.rect.y + bounds.rect.height,
    },
    rectColor,
    3
  );

  if (bounds.polygon && bounds.polygon.length >= 3) {
    const polygonColor = new cv.Scalar(0, 255, 0, 255);
    const polygonData: Array<number> = [];
    for (const point of bounds.polygon) {
      polygonData.push(point.x, point.y);
    }

    const polygonMat = cv.matFromArray(
      bounds.polygon.length,
      1,
      cv.CV_32SC2,
      polygonData
    );
    const matVector = new cv.MatVector();

    try {
      matVector.push_back(polygonMat);
      cv.polylines(visualization, matVector, true, polygonColor, 4);

      for (const vertex of bounds.polygon) {
        cv.circle(
          visualization,
          { x: Math.round(vertex.x), y: Math.round(vertex.y) },
          6,
          polygonColor,
          -1
        );
      }
    } finally {
      matVector.delete();
      polygonMat.delete();
    }
  }

  const result = matToDataUrl(cv, visualization);
  visualization.delete();

  return result;
}

/**
 * Generate a distinctive color for each text line.
 *
 * WHY: Following Matt Zucker's visualization approach, we assign a unique
 * color to each detected text line to make them easily distinguishable.
 * Uses HSV color space for evenly distributed, vibrant colors.
 *
 * @returns Array of RGBA values [r, g, b, a]
 */
function generateLineColor(
  index: number,
  total: number
): [number, number, number, number] {
  const hue = (index * 360) / total;
  const saturation = 0.8 + (index % 3) * 0.1;
  const value = 0.9;

  const c = value * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = value - c;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (hue < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (hue < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (hue < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
    255,
  ];
}

/**
 * Visualize fitted lines on the source image.
 *
 * WHY: This visualization matches Matt Zucker's page_dewarp.py output,
 * showing each detected text line as a colored line segment. Each line
 * gets a unique color to make them easily distinguishable.
 *
 * This helps verify that:
 * - Text lines were detected correctly
 * - Line fitting produces reasonable orientations
 * - Lines follow the curvature of the page
 */
function visualizeFittedLines(
  cv: OpenCVPreprocessing,
  src: Mat,
  textContoursWithLines: Array<{
    rect: { x: number; y: number; width: number; height: number };
    points: Array<Point2D>;
    fittedLine: { start: Point2D; end: Point2D } | null;
  }>
): DataUrl {
  const visualization = new cv.Mat();
  src.copyTo(visualization);

  for (let i = 0; i < textContoursWithLines.length; i++) {
    const contour = textContoursWithLines[i];
    if (!contour.fittedLine) continue;

    const [r, g, b, a] = generateLineColor(i, textContoursWithLines.length);
    const color = new cv.Scalar(r, g, b, a);

    cv.line(
      visualization,
      contour.fittedLine.start,
      contour.fittedLine.end,
      color,
      3
    );

    const midX = (contour.fittedLine.start.x + contour.fittedLine.end.x) / 2;
    const midY = (contour.fittedLine.start.y + contour.fittedLine.end.y) / 2;

    cv.rectangle(
      visualization,
      { x: Math.round(midX - 3), y: Math.round(midY - 3) },
      { x: Math.round(midX + 3), y: Math.round(midY + 3) },
      new cv.Scalar(255, 255, 255, 255),
      -1
    );

    const width = contour.rect.width;
    const height = contour.rect.height;
    const aspect = width / Math.max(height, 1);
    const dx = contour.fittedLine.end.x - contour.fittedLine.start.x;
    const dy = contour.fittedLine.end.y - contour.fittedLine.start.y;
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

    const label = `w:${width} a:${aspect.toFixed(1)} θ:${angleDeg.toFixed(0)}°`;
    const textPos = {
      x: Math.round(midX + 10),
      y: Math.round(midY - 10),
    };

    cv.putText(
      visualization,
      label,
      textPos,
      cv.FONT_HERSHEY_SIMPLEX,
      1,
      new cv.Scalar(255, 255, 255, 255),
      3
    );
    cv.putText(
      visualization,
      label,
      textPos,
      cv.FONT_HERSHEY_SIMPLEX,
      1,
      color,
      1
    );
  }

  const result = matToDataUrl(cv, visualization);
  visualization.delete();

  return result;
}

/**
 * Get a large, visually distinct icon for each rejection reason.
 */
function getRejectionIcon(
  reason: "width" | "height" | "aspect" | "thickness"
): string {
  switch (reason) {
    case "width":
      return "W";
    case "height":
      return "H";
    case "aspect":
      return "A";
    case "thickness":
      return "T";
  }
}

/**
 * Visualize all contours and text contours together.
 * Shows all contours as filled cyan shapes and text contours as filled green boxes.
 * Rejected contours are marked with large icons indicating the rejection reason.
 */
function visualizeContoursAndTextContours(
  cv: OpenCVPreprocessing,
  src: Mat,
  contours: Array<Array<Point2D>>,
  textContours: Array<{
    rect: { x: number; y: number; width: number; height: number };
  }>,
  rejectedContours: Array<{
    rect: { x: number; y: number; width: number; height: number };
    reason: "width" | "height" | "aspect" | "thickness";
  }>
): DataUrl {
  const visualization = new cv.Mat();
  src.copyTo(visualization);
  const contourColor = new cv.Scalar(0, 255, 255, 255);
  const textColor = new cv.Scalar(0, 255, 0, 255);

  const matVector = new cv.MatVector();

  try {
    for (const contour of contours) {
      if (contour.length < 3) continue;

      const data = [];
      for (const point of contour) {
        data.push(point.x, point.y);
      }

      const contourMat = cv.matFromArray(contour.length, 1, cv.CV_32SC2, data);
      matVector.push_back(contourMat);
      contourMat.delete();
    }

    if (matVector.size() > 0) {
      cv.fillPoly(visualization, matVector, contourColor);
    }
  } finally {
    matVector.delete();
  }

  for (const tc of textContours) {
    cv.rectangle(
      visualization,
      { x: tc.rect.x, y: tc.rect.y },
      { x: tc.rect.x + tc.rect.width, y: tc.rect.y + tc.rect.height },
      textColor,
      -1
    );

    const width = tc.rect.width;
    const height = tc.rect.height;
    const aspect = width / Math.max(height, 1);
    const label = `w:${width} h:${height} a:${aspect.toFixed(1)}`;
    const textPos = {
      x: tc.rect.x + 5,
      y: tc.rect.y + height / 2,
    };

    cv.putText(
      visualization,
      label,
      textPos,
      cv.FONT_HERSHEY_SIMPLEX,
      1,
      new cv.Scalar(0, 0, 0, 255),
      3
    );
    cv.putText(
      visualization,
      label,
      textPos,
      cv.FONT_HERSHEY_SIMPLEX,
      1,
      new cv.Scalar(255, 255, 255, 255),
      1
    );
  }

  for (const rejected of rejectedContours) {
    const icon = getRejectionIcon(rejected.reason);
    const centerX = rejected.rect.x + rejected.rect.width / 2;
    const centerY = rejected.rect.y + rejected.rect.height / 2;
    const iconPos = {
      x: Math.round(centerX - 15),
      y: Math.round(centerY + 15),
    };

    cv.putText(
      visualization, // output image (Mat)
      icon, // text string to be drawn (string)
      iconPos, // bottom-left corner of the text (Point)
      cv.FONT_HERSHEY_SIMPLEX, // font face (constant)
      1.5, // font scale (float)
      new cv.Scalar(0, 0, 0, 255), // text color (BGRA, black, fully opaque)
      8 // thickness of the text outline (int)
    );
    cv.putText(
      visualization, // output image (Mat)
      icon, // text string to be drawn (string)
      iconPos, // bottom-left corner of the text (Point)
      cv.FONT_HERSHEY_SIMPLEX, // font face (constant)
      1.5, // font scale (float)
      new cv.Scalar(255, 0, 0, 255), // text color (BGRA, blue, fully opaque)
      3 // thickness of the text (int)
    );
  }

  const result = matToDataUrl(cv, visualization);
  visualization.delete();

  return result;
}

/**
 * Generate debug visualizations for the preprocessing pipeline.
 *
 * WHY: Debug data helps understand what the algorithm is detecting and troubleshoot
 * issues with text detection. Each visualization shows a different stage of processing.
 */
export function generatePreprocessingDebugData(
  cv: OpenCVPreprocessing,
  src: Mat,
  gray: Mat,
  binary: Mat,
  processedBinary: Mat | null,
  allContoursArray: Array<Array<Point2D>>,
  textContours: Array<{
    rect: { x: number; y: number; width: number; height: number };
  }>,
  rejectedContours: Array<{
    rect: { x: number; y: number; width: number; height: number };
    reason: "width" | "height" | "aspect" | "thickness";
  }>,
  textContoursWithLines: Array<{
    rect: { x: number; y: number; width: number; height: number };
    points: Array<Point2D>;
    fittedLine: { start: Point2D; end: Point2D } | null;
  }>,
  pageBounds: PageBounds
): {
  enhancedGrayscale?: DataUrl;
  binaryText?: DataUrl;
  erodedText?: DataUrl;
  edgeMap?: DataUrl;
  detectedLines?: DataUrl;
  detectedContours?: DataUrl;
  fittedLines?: DataUrl;
  pageBoundary?: DataUrl;
  preprocessingStats: {
    contoursFound: number;
    linesDetected: number;
    pageBounds: { width: number; height: number };
  };
} {
  return {
    enhancedGrayscale: matToDataUrl(cv, gray),
    binaryText: matToDataUrl(cv, binary),
    erodedText: processedBinary ? matToDataUrl(cv, processedBinary) : undefined,
    detectedLines: visualizeContoursAndTextContours(
      cv,
      src,
      allContoursArray,
      textContours,
      rejectedContours
    ),
    fittedLines: visualizeFittedLines(cv, src, textContoursWithLines),
    pageBoundary: visualizeBoundary(cv, src, pageBounds),
    preprocessingStats: {
      contoursFound: allContoursArray.length,
      linesDetected: textContours.length,
      pageBounds: {
        width: pageBounds.rect.width,
        height: pageBounds.rect.height,
      },
    },
  };
}

/**
 * Visualize optimized spans (curved baselines) on the source image.
 */
export function visualizeDetectedSpans(
  cv: OpenCVPreprocessing,
  src: Mat,
  spans: Array<SpanParams>
): DataUrl {
  const visualization = new cv.Mat();
  src.copyTo(visualization);
  const color = new cv.Scalar(255, 0, 255, 255);

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const samples = sampleKeypointsOnSpan(span, src.cols, 80);

    for (let j = 0; j < samples.length - 1; j++) {
      const start = samples[j];
      const end = samples[j + 1];
      cv.line(
        visualization,
        { x: Math.round(start.x), y: Math.round(start.y) },
        { x: Math.round(end.x), y: Math.round(end.y) },
        color,
        2
      );
    }

    const midIdx = Math.floor(samples.length / 2);
    const labelPos = samples[midIdx];
    cv.putText(
      visualization,
      `s${i + 1}`,
      { x: Math.round(labelPos.x), y: Math.round(labelPos.y - 6) },
      cv.FONT_HERSHEY_SIMPLEX,
      0.6,
      color,
      2
    );
  }

  const result = matToDataUrl(cv, visualization);
  visualization.delete();
  return result;
}

/**
 * Visualize keypoint cloud sampled from optimized spans.
 */
export function visualizeKeypointCloud(
  cv: OpenCVPreprocessing,
  src: Mat,
  keypoints: Array<Point2D>
): DataUrl {
  const visualization = new cv.Mat();
  src.copyTo(visualization);
  const pointColor = new cv.Scalar(0, 255, 255, 255);

  for (const point of keypoints) {
    cv.circle(
      visualization,
      { x: Math.round(point.x), y: Math.round(point.y) },
      4,
      pointColor,
      -1
    );
  }

  const result = matToDataUrl(cv, visualization);
  visualization.delete();
  return result;
}

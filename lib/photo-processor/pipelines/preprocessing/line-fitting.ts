/**
 * Line fitting and merging operations for text contours.
 */

import type { OpenCVPreprocessing } from "@/lib/photo-processor/opencv";
import type { Point2D } from "../page-dewarp-core";
import type { CVMatVector } from "../page-dewarp-remap";

export type PageBounds = {
  rect: { x: number; y: number; width: number; height: number };
  polygon: Array<Point2D> | null;
};

export type PageDetectionConfig = {
  minAreaRatio: number;
  minAspectRatio: number;
  maxAspectRatio: number;
};

/**
 * Fit a line segment to a contour using OpenCV's fitLine.
 *
 * WHY: fitLine uses least-squares fitting to find the best approximation
 * of a line through the contour points. This represents the main orientation
 * of the text line. We then extend the line to cover the full extent of the contour.
 *
 * The fitLine output is [vx, vy, x0, y0] where:
 * - (vx, vy) is the normalized direction vector
 * - (x0, y0) is a point on the line
 *
 * @returns Line segment {start, end} or null if fitting fails
 */
export function fitLineUsingPCA(
  cv: OpenCVPreprocessing,
  points: Array<Point2D>
): { start: Point2D; end: Point2D } | null {
  if (points.length < 2) {
    return null;
  }

  const pointsMat = new cv.Mat();
  const line = new cv.Mat();

  try {
    const flatData = new Float32Array(points.length * 2);
    for (let i = 0; i < points.length; i++) {
      flatData[i * 2] = points[i].x;
      flatData[i * 2 + 1] = points[i].y;
    }

    const tempMat = cv.matFromArray(
      points.length,
      1,
      cv.CV_32FC2,
      Array.from(flatData)
    );
    tempMat.copyTo(pointsMat);
    tempMat.delete();

    cv.fitLine(pointsMat, line, cv.DIST_L2, 0, 0.01, 0.01);

    const vx = line.data32F[0];
    const vy = line.data32F[1];
    const x0 = line.data32F[2];
    const y0 = line.data32F[3];

    let minProj = Infinity;
    let maxProj = -Infinity;

    for (const pt of points) {
      const proj = (pt.x - x0) * vx + (pt.y - y0) * vy;
      minProj = Math.min(minProj, proj);
      maxProj = Math.max(maxProj, proj);
    }

    const start = {
      x: Math.round(x0 + minProj * vx),
      y: Math.round(y0 + minProj * vy),
    };
    const end = {
      x: Math.round(x0 + maxProj * vx),
      y: Math.round(y0 + maxProj * vy),
    };

    return { start, end };
  } catch (error) {
    console.warn("Line fitting failed:", error);
    return null;
  } finally {
    pointsMat.delete();
    line.delete();
  }
}

/**
 * Approximate each text contour by its best-fitting line segment.
 *
 * WHY: As described in Matt Zucker's page_dewarp.py, after filtering contours,
 * we need to find the main orientation of each text line. OpenCV's fitLine
 * uses least-squares to give us the best-fitting line through the contour points.
 */
export function fitLinesToContours(
  cv: OpenCVPreprocessing,
  textContours: Array<{
    rect: { x: number; y: number; width: number; height: number };
    points: Array<Point2D>;
  }>
): Array<{
  rect: { x: number; y: number; width: number; height: number };
  points: Array<Point2D>;
  fittedLine: { start: Point2D; end: Point2D } | null;
}> {
  return textContours.map((contour) => {
    const fittedLine = fitLineUsingPCA(cv, contour.points);
    return {
      ...contour,
      fittedLine,
    };
  });
}

/**
 * Merge nearby line segments that are approximately collinear.
 *
 * WHY: Morphological operations may create separate contours for text that should
 * form a continuous line (e.g., words separated by spaces, or text with gaps).
 * This function merges lines that are close together, have similar angles, and
 * are roughly aligned.
 */
export function mergeNearbyLines(
  cv: OpenCVPreprocessing,
  lines: Array<{
    rect: { x: number; y: number; width: number; height: number };
    points: Array<Point2D>;
    fittedLine: { start: Point2D; end: Point2D } | null;
  }>,
  maxAngleDiff: number = 10,
  maxVerticalGap: number = 20,
  maxHorizontalGap: number = 100
): Array<{
  rect: { x: number; y: number; width: number; height: number };
  points: Array<Point2D>;
  fittedLine: { start: Point2D; end: Point2D } | null;
}> {
  if (lines.length === 0) return [];

  const merged: Array<boolean> = new Array(lines.length).fill(false);
  const result: Array<{
    rect: { x: number; y: number; width: number; height: number };
    points: Array<Point2D>;
    fittedLine: { start: Point2D; end: Point2D } | null;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    if (merged[i] || !lines[i].fittedLine) continue;

    const line1 = lines[i].fittedLine!;
    const angle1 = Math.atan2(
      line1.end.y - line1.start.y,
      line1.end.x - line1.start.x
    );
    const y1 = (line1.start.y + line1.end.y) / 2;

    const mergeGroup: Array<number> = [i];

    for (let j = i + 1; j < lines.length; j++) {
      if (merged[j] || !lines[j].fittedLine) continue;

      const line2 = lines[j].fittedLine!;
      const angle2 = Math.atan2(
        line2.end.y - line2.start.y,
        line2.end.x - line2.start.x
      );
      const y2 = (line2.start.y + line2.end.y) / 2;

      const angleDiff = Math.abs(angle1 - angle2) * (180 / Math.PI);
      const verticalGap = Math.abs(y1 - y2);

      const rect1 = lines[i].rect;
      const rect2 = lines[j].rect;
      const horizontalGap = Math.min(
        Math.abs(rect1.x + rect1.width - rect2.x),
        Math.abs(rect2.x + rect2.width - rect1.x)
      );

      if (
        angleDiff < maxAngleDiff &&
        verticalGap < maxVerticalGap &&
        horizontalGap < maxHorizontalGap
      ) {
        mergeGroup.push(j);
        merged[j] = true;
      }
    }

    merged[i] = true;

    if (mergeGroup.length === 1) {
      result.push(lines[i]);
    } else {
      const allPoints: Array<Point2D> = [];
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      for (const idx of mergeGroup) {
        allPoints.push(...lines[idx].points);
        const rect = lines[idx].rect;
        minX = Math.min(minX, rect.x);
        maxX = Math.max(maxX, rect.x + rect.width);
        minY = Math.min(minY, rect.y);
        maxY = Math.max(maxY, rect.y + rect.height);
      }

      const mergedRect = {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };

      const refittedLine = fitLineUsingPCA(cv, allPoints);

      result.push({
        rect: mergedRect,
        points: allPoints,
        fittedLine: refittedLine,
      });
    }
  }

  return result;
}

/**
 * Find the page bounds by preferring the largest quadrilateral that looks like a page.
 *
 * WHY: The true page is usually the biggest four-sided contour with a tall aspect ratio.
 * We approximate each contour, enforce configurable area/aspect criteria, and fall back
 * to the largest bounding box when no good candidate exists.
 */
export function findPageBounds(
  cv: OpenCVPreprocessing,
  contours: CVMatVector,
  defaultWidth: number,
  defaultHeight: number,
  config: PageDetectionConfig
): PageBounds {
  const fallbackRect = {
    x: 0,
    y: 0,
    width: defaultWidth,
    height: defaultHeight,
  };

  if (contours.size() === 0) {
    return { rect: fallbackRect, polygon: null };
  }

  const imageArea = defaultWidth * defaultHeight;
  const minCandidateArea = imageArea * config.minAreaRatio;

  let fallbackArea = 0;
  let fallbackBounds = fallbackRect;
  let bestCandidate: {
    rect: { x: number; y: number; width: number; height: number };
    polygon: Array<Point2D>;
    area: number;
  } | null = null;

  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const rect = cv.boundingRect(contour);
    const rectArea = rect.width * rect.height;
    if (rectArea > fallbackArea) {
      fallbackArea = rectArea;
      fallbackBounds = rect;
    }

    const contourArea = Math.abs(cv.contourArea(contour, false));
    if (contourArea < minCandidateArea) {
      continue;
    }

    const perimeter = cv.arcLength(contour, true);
    if (perimeter === 0) {
      continue;
    }

    const approx = new cv.Mat();
    try {
      cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

      if (approx.rows !== 4) {
        continue;
      }

      const candidateRect = cv.boundingRect(approx);
      const aspectRatio =
        candidateRect.height / Math.max(candidateRect.width, 1);
      if (
        aspectRatio < config.minAspectRatio ||
        aspectRatio > config.maxAspectRatio
      ) {
        continue;
      }

      const polygon: Array<Point2D> = [];
      const data = approx.data32S;
      for (let idx = 0; idx < data.length; idx += 2) {
        polygon.push({ x: data[idx], y: data[idx + 1] });
      }

      if (!bestCandidate || contourArea > bestCandidate.area) {
        bestCandidate = {
          rect: candidateRect,
          polygon,
          area: contourArea,
        };
      }
    } finally {
      approx.delete();
    }
  }

  if (bestCandidate) {
    return { rect: bestCandidate.rect, polygon: bestCandidate.polygon };
  }

  return { rect: fallbackBounds, polygon: null };
}

/**
 * Span estimation for page dewarping.
 */

import type { OpenCVPreprocessing } from "@/lib/photo-processor/opencv";
import type { DataUrl } from "@/lib/types/primitives";
import type { Mat } from "@techstark/opencv-js";
import type { Point2D, SpanParams } from "../page-dewarp-core";

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
 * Extract span estimates from text contours.
 * Groups contours by vertical position to find text lines.
 */
export function extractSpanEstimatesFromContours(
  textContours: Array<{
    rect: { x: number; y: number; width: number; height: number };
  }>,
  imageHeight: number,
  numSpans: number
): Array<SpanParams> {
  if (textContours.length === 0) {
    return extractSpanEstimates([], imageHeight, numSpans);
  }

  const availableY = textContours
    .map((tc) => tc.rect.y + tc.rect.height / 2)
    .sort((a, b) => a - b);

  const spans: Array<SpanParams> = [];
  const step = imageHeight / (numSpans + 1);

  for (let i = 0; i < numSpans; i++) {
    const targetY = step * (i + 1);

    let yPosition = targetY;

    if (availableY.length > 0) {
      let closestIndex = 0;
      let closestDistance = Math.abs(availableY[0] - targetY);

      for (let idx = 1; idx < availableY.length; idx++) {
        const distance = Math.abs(availableY[idx] - targetY);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = idx;
        }
      }

      yPosition = availableY.splice(closestIndex, 1)[0];
    }

    spans.push({
      yPosition: Math.max(0, Math.min(imageHeight, yPosition)),
      curvature: 0,
    });
  }

  spans.sort((a, b) => a.yPosition - b.yPosition);

  return spans;
}

/**
 * Visualize span estimates on source image.
 */
export function visualizeSpanEstimates(
  cv: OpenCVPreprocessing,
  src: Mat,
  spans: Array<SpanParams>
): DataUrl {
  const visualization = new cv.Mat();
  src.copyTo(visualization);
  const color = new cv.Scalar(0, 255, 255, 255);

  for (const span of spans) {
    const y = Math.round(span.yPosition);
    cv.line(visualization, { x: 0, y }, { x: src.cols, y }, color, 2);
  }

  const canvas = document.createElement("canvas");
  cv.imshow(canvas, visualization);
  const result = canvas.toDataURL("image/png") as DataUrl;
  visualization.delete();

  return result;
}

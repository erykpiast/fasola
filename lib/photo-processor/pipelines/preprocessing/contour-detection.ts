/**
 * Contour detection and filtering operations.
 */

import type { Mat } from "@techstark/opencv-js";
import type { OpenCVPreprocessing } from "@/lib/photo-processor/opencv";
import type { Point2D } from "../page-dewarp-core";
import type { CVMatVector } from "../page-dewarp-remap";

/**
 * Extract all contours from binary image with full hierarchy information.
 *
 * WHY: Contours represent the boundaries of connected regions. In our processed image,
 * these regions correspond to text lines and other features. We use RETR_TREE to preserve
 * parent-child relationships (e.g., holes in letters like 'o' or 'a'), which may be useful
 * for filtering.
 */
export function extractAllContours(
  cv: OpenCVPreprocessing,
  processedBinary: Mat
): { contours: CVMatVector; hierarchy: Mat } {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  cv.findContours(
    processedBinary,
    contours,
    hierarchy,
    cv.RETR_TREE,
    cv.CHAIN_APPROX_SIMPLE
  );

  return { contours, hierarchy };
}

/**
 * Filter contours to identify text line regions based on geometric properties.
 *
 * WHY: Not all contours represent text. The morphological operations may create artifacts
 * or detect non-text elements (borders, images, noise). We filter based on:
 *
 * - Width: Text lines must be reasonably long (textMinWidth)
 * - Height: Must be tall enough to be actual text (textMinHeight)
 * - Aspect ratio: Text lines are typically much wider than tall (textMinAspect)
 * - Max thickness: Filters out large blocks that aren't individual text lines (textMaxThickness)
 *
 * This heuristic approach is based on Matt Zucker's page_dewarp.py implementation.
 */
export function filterTextContours(
  cv: OpenCVPreprocessing,
  allContours: CVMatVector,
  config: {
    textMinWidth: number;
    textMinHeight: number;
    textMinAspect: number;
    textMaxThickness: number;
  }
): {
  allContoursArray: Array<Array<Point2D>>;
  textContours: Array<{
    rect: { x: number; y: number; width: number; height: number };
    points: Array<Point2D>;
  }>;
  rejectedContours: Array<{
    rect: { x: number; y: number; width: number; height: number };
    reason: "width" | "height" | "aspect" | "thickness";
  }>;
} {
  const allContoursArray: Array<Array<Point2D>> = [];
  const textContours: Array<{
    rect: { x: number; y: number; width: number; height: number };
    points: Array<Point2D>;
  }> = [];
  const rejectedContours: Array<{
    rect: { x: number; y: number; width: number; height: number };
    reason: "width" | "height" | "aspect" | "thickness";
  }> = [];

  let rejectedByWidth = 0;
  let rejectedByHeight = 0;
  let rejectedByAspect = 0;
  let rejectedByThickness = 0;

  for (let i = 0; i < allContours.size(); i++) {
    const contour = allContours.get(i);
    const points: Array<Point2D> = [];

    for (let j = 0; j < contour.data32S.length; j += 2) {
      points.push({
        x: contour.data32S[j],
        y: contour.data32S[j + 1],
      });
    }

    allContoursArray.push(points);

    const rect = cv.boundingRect(contour);
    const width = rect.width;
    const height = rect.height;
    const aspect = width / Math.max(height, 1);

    const passesWidth = width >= config.textMinWidth;
    const passesHeight = height >= config.textMinHeight;
    const passesAspect = aspect >= config.textMinAspect;
    const passesThickness = height <= config.textMaxThickness;

    if (passesWidth && passesHeight && passesAspect && passesThickness) {
      textContours.push({ rect, points });
    } else {
      let primaryReason: "width" | "height" | "aspect" | "thickness" = "width";

      if (!passesWidth) {
        rejectedByWidth++;
        primaryReason = "width";
      } else if (!passesHeight) {
        rejectedByHeight++;
        primaryReason = "height";
      } else if (!passesAspect) {
        rejectedByAspect++;
        primaryReason = "aspect";
      } else if (!passesThickness) {
        rejectedByThickness++;
        primaryReason = "thickness";
      }

      rejectedContours.push({ rect, reason: primaryReason });

      if (i < 10 || (rect.x < 500 && i < 50)) {
        console.log(
          `[Contour ${i}] REJECTED - x:${rect.x} y:${
            rect.y
          } w:${width} h:${height} aspect:${aspect.toFixed(2)} | ` +
            `width:${passesWidth ? "✓" : "✗"} height:${
              passesHeight ? "✓" : "✗"
            } aspect:${passesAspect ? "✓" : "✗"} thickness:${
              passesThickness ? "✓" : "✗"
            } [${primaryReason.toUpperCase()}]`
        );
      }
    }
  }

  console.log(
    `[Text Filtering] Total: ${allContours.size()}, Accepted: ${
      textContours.length
    }`
  );
  console.log(
    `[Text Filtering] Rejected by - width:${rejectedByWidth} height:${rejectedByHeight} aspect:${rejectedByAspect} thickness:${rejectedByThickness}`
  );

  return { allContoursArray, textContours, rejectedContours };
}


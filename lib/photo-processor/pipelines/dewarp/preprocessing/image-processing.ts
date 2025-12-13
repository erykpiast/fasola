/**
 * Basic image processing operations for preprocessing.
 */

import type { Mat } from "@techstark/opencv-js";
import type { OpenCVPreprocessing } from "@/lib/photo-processor/opencv";

/**
 * Convert color image to grayscale.
 *
 * WHY: Grayscale simplifies subsequent operations and reduces computational complexity.
 * Color information is not needed for detecting text structure.
 */
export function convertToGrayscale(cv: OpenCVPreprocessing, src: Mat): Mat {
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  return gray;
}

/**
 * Apply adaptive thresholding to separate text from background.
 *
 * WHY: Adaptive thresholding handles varying lighting conditions across the page better
 * than global thresholding. Each pixel's threshold is calculated based on its local
 * neighborhood, making it robust to shadows and uneven illumination.
 *
 * The result is inverted (THRESH_BINARY_INV) to produce white text on black background,
 * which is the expected format for morphological operations and contour detection in OpenCV.
 *
 * @param windowSize - Size of the pixel neighborhood for threshold calculation. Larger values
 *                     are more robust to noise but may miss fine details.
 */
export function applyAdaptiveThreshold(
  cv: OpenCVPreprocessing,
  gray: Mat,
  windowSize: number
): Mat {
  const binary = new cv.Mat();
  cv.adaptiveThreshold(
    gray,
    binary,
    255,
    cv.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv.THRESH_BINARY_INV,
    windowSize,
    25
  );
  return binary;
}

/**
 * Apply morphological operations to connect text characters into lines.
 *
 * WHY: Individual characters appear as separate blobs after thresholding. To detect
 * text lines, we need to connect characters that belong to the same line.
 *
 * OPERATION SEQUENCE:
 * 1. Horizontal dilation: Connects characters horizontally into continuous
 *    text line regions. The wide horizontal kernel merges letters in the same line while
 *    preserving vertical separation between lines.
 *
 * 2. Vertical erosion: Removes vertical connections between lines that may
 *    have been created by tall letters (like 'g', 'y', 'p') extending into adjacent lines.
 *    This ensures clean separation between text lines.
 *
 * The combination (dilation then erosion) is called "closing" in morphology, but with
 * different kernel orientations for directional processing.
 */
export function connectTextIntoLines(cv: OpenCVPreprocessing, binary: Mat): Mat {
  const dilated = new cv.Mat();
  const horizontalKernel = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(48, 1)
  );
  cv.dilate(binary, dilated, horizontalKernel);
  horizontalKernel.delete();

  const result = new cv.Mat();
  const verticalKernel = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(1, 8)
  );
  cv.erode(dilated, result, verticalKernel);
  verticalKernel.delete();
  dilated.delete();

  return result;
}


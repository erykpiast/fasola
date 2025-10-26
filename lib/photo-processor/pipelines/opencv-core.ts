/**
 * Basic OpenCV demo functions to verify OpenCV setup works on web and native.
 * Performs simple Canny edge detection for demonstration purposes.
 */

import { Mat } from "@techstark/opencv-js";
import type { DebugVisualizationData } from "../types";

/**
 * Result of geometry correction with optional debug data.
 */
export interface GeometryCorrectionResult {
  mat: Mat | null;
  debug?: DebugVisualizationData;
}

/**
 * Basic demo: Apply Canny edge detection and return original image.
 * This is a minimal demonstration to verify OpenCV is working.
 * @param cv - OpenCV instance
 * @param src - Source Mat
 * @param config - Geometry configuration (unused in demo)
 * @param collectDebugData - Whether to collect debug visualization data
 * @returns Original Mat with basic edge detection in debug data
 */
export function applyGeometryCorrection(
  cv: {
    Mat: new () => Mat;
    cvtColor: (src: Mat, dst: Mat, code: number) => void;
    Canny: (src: Mat, dst: Mat, threshold1: number, threshold2: number) => void;
    imshow: (canvas: HTMLCanvasElement, mat: Mat) => void;
    COLOR_RGBA2GRAY: number;
  },
  src: Mat,
  collectDebugData: boolean = false
): GeometryCorrectionResult {
  let debugData: DebugVisualizationData | undefined;

  if (collectDebugData) {
    const gray = new cv.Mat();
    const edges = new cv.Mat();

    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.Canny(gray, edges, 50, 150);

      debugData = {
        edges: matToDataUrl(cv, edges),
        imageWidth: src.cols,
        imageHeight: src.rows,
      };
    } finally {
      gray.delete();
      edges.delete();
    }
  }

  console.log(
    "[OpenCV Demo] Returning original image with basic edge detection"
  );
  return { mat: src, debug: debugData };
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

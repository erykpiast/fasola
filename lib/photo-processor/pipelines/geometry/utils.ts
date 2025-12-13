import type { DataUrl } from "@/lib/types/primitives";
import type { CV, CVMat } from "../../types/opencv";

export function imgsize(img: CVMat): string {
  return `${img.cols}x${img.rows}`;
}

/**
 * Loads an image from DataUrl into an OpenCV Mat.
 */
export async function loadImageMat(
  cv: CV,
  imageDataUrl: DataUrl
): Promise<CVMat> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = imageDataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2d context");
  }
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  return cv.matFromImageData(imageData);
}

/**
 * Converts an OpenCV Mat to a DataUrl.
 */
export function matToDataUrl(cv: CV, mat: CVMat): DataUrl {
  const img = new cv.Mat();
  if (mat.channels() === 1) {
    cv.cvtColor(mat, img, cv.COLOR_GRAY2RGBA);
  } else if (mat.channels() === 3) {
    cv.cvtColor(mat, img, cv.COLOR_RGB2RGBA);
  } else {
    mat.copyTo(img);
  }

  const canvas = document.createElement("canvas");
  canvas.width = img.cols;
  canvas.height = img.rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    img.delete();
    throw new Error("Failed to get 2d context");
  }

  const imageData = new ImageData(
    new Uint8ClampedArray(img.data),
    img.cols,
    img.rows
  );
  ctx.putImageData(imageData, 0, 0);
  img.delete();
  return canvas.toDataURL("image/png") as DataUrl;
}

export function fltp(point: { data32F?: Float32Array } | [number, number]): [number, number] {
  if (Array.isArray(point)) {
    return [Math.round(point[0]), Math.round(point[1])];
  }
  if (point.data32F) {
    return [Math.round(point.data32F[0]), Math.round(point.data32F[1])];
  }
  return [0, 0];
}

export function roundNearestMultiple(i: number, factor: number): number {
  i = Math.round(i);
  const rem = i % factor;
  return rem ? i + factor - rem : i;
}

/**
 * Converts pixel coordinates to normalized coordinates centered at the image center.
 */
export function pix2norm(
  shape: CVMat | { rows: number; cols: number } | [number, number],
  pts: Array<[number, number]>
): Array<[number, number]> {
  const height = Array.isArray(shape) ? shape[0] : shape.rows;
  const width = Array.isArray(shape) ? shape[1] : shape.cols;
  const scl = 2.0 / Math.max(height, width);
  const offsetX = width * 0.5;
  const offsetY = height * 0.5;

  return pts.map((p) => [(p[0] - offsetX) * scl, (p[1] - offsetY) * scl]);
}

/**
 * Converts normalized coordinates back to pixel coordinates.
 */
export function norm2pix(
  shape: CVMat | { rows: number; cols: number } | [number, number],
  pts: Array<[number, number]>,
  asInteger = true
): Array<[number, number]> {
  const height = Array.isArray(shape) ? shape[0] : shape.rows;
  const width = Array.isArray(shape) ? shape[1] : shape.cols;
  const scl = Math.max(height, width) * 0.5;
  const offsetX = width * 0.5;
  const offsetY = height * 0.5;

  return pts.map((p) => {
    let x = p[0] * scl + offsetX;
    let y = p[1] * scl + offsetY;
    if (asInteger) {
      x = Math.trunc(x + 0.5);
      y = Math.trunc(y + 0.5);
    }
    return [x, y];
  });
}


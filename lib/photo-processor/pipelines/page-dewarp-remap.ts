/**
 * Remapping logic for page dewarping.
 * Generates mesh grid and applies inverse transformation.
 *
 * REMAPPING PHASE EXPLAINED:
 * =========================
 * Now that we know the 3D shape of the page (from cubic sheet fitting),
 * we need to actually dewarp the image - create a flat output from the
 * curved input.
 *
 * The challenge: Forward vs. Inverse mapping
 * - Forward: "Where does this input pixel go in the output?" → Leaves holes
 * - Inverse: "Where did this output pixel come from in the input?" → Perfect
 *
 * We use inverse mapping:
 * 1. For each pixel (x, y) in the flat output image:
 *    a. Treat it as a point on the flat page
 *    b. Use the cubic model to determine its z-height on the 3D surface
 *    c. Project that 3D point to find where it appears in the input photo
 * 2. Sample the input photo at that location (with interpolation)
 * 3. Copy the color to the output pixel
 *
 * OpenCV's remap() function:
 * - Takes two "map" images: mapX and mapY
 * - For each output pixel at (x, y):
 *   - Looks up source_x = mapX[y][x] and source_y = mapY[y][x]
 *   - Samples input image at (source_x, source_y)
 *   - Uses cubic interpolation for smooth results
 *
 * Result: A flat, dewarped image where text lines are horizontal.
 */

import type { DataUrl } from "@/lib/types/primitives";
import type { Mat } from "@techstark/opencv-js";
import type {
  CubicSheetParams,
  DewarpProgressCallback,
  Point2D,
  Point3D,
} from "./page-dewarp-core";
import { evaluateCubicPolynomial, project3DTo2D } from "./page-dewarp-core";

/**
 * OpenCV interface for remapping operations.
 */
export interface OpenCVRemap {
  Mat: new () => Mat;
  remap: (
    src: Mat,
    dst: Mat,
    map1: Mat,
    map2: Mat,
    interpolation: number,
    borderMode?: number,
    borderValue?: any
  ) => void;
  convertScaleAbs: (src: Mat, dst: Mat, alpha?: number, beta?: number) => void;
  adaptiveThreshold: (
    src: Mat,
    dst: Mat,
    maxValue: number,
    adaptiveMethod: number,
    thresholdType: number,
    blockSize: number,
    C: number
  ) => void;
  cvtColor: (src: Mat, dst: Mat, code: number) => void;
  resize: (
    src: Mat,
    dst: Mat,
    dsize: any,
    fx?: number,
    fy?: number,
    interpolation?: number
  ) => void;
  hconcat: (src: Array<Mat>, dst: Mat) => void;
  line: (
    img: Mat,
    pt1: Point2D,
    pt2: Point2D,
    color: any,
    thickness?: number
  ) => void;
  circle: (
    img: Mat,
    center: Point2D,
    radius: number,
    color: any,
    thickness?: number
  ) => void;
  imshow: (canvas: HTMLCanvasElement, mat: Mat) => void;
  INTER_CUBIC: number;
  INTER_LINEAR: number;
  BORDER_CONSTANT: number;
  ADAPTIVE_THRESH_GAUSSIAN_C: number;
  THRESH_BINARY: number;
  COLOR_RGBA2GRAY: number;
  COLOR_GRAY2RGBA: number;
  Size: new (width: number, height: number) => any;
  Scalar: new (...values: Array<number>) => any;
}

/**
 * Generate dewarp transformation maps.
 *
 * MAP GENERATION EXPLAINED:
 * ========================
 * This is where we compute the inverse mapping from flat output to curved input.
 *
 * For each pixel in the output image:
 * 1. Normalize coordinates: (x, y) → (normX, normY) in range [-0.5, 0.5]
 *    - This makes the math scale-independent
 *
 * 2. Evaluate cubic polynomial: z = f(normX, normY)
 *    - Get the height of the page at this location
 *    - z = 0 means flat, z > 0 means bulging toward camera
 *
 * 3. Create 3D point: (normX * width, normY * height, z * width)
 *    - Scale back to image coordinates
 *    - z is scaled by width to keep proportions reasonable
 *
 * 4. Project to 2D: (x_input, y_input) = project3D(point3D)
 *    - This tells us where this flat point appears in the curved photo
 *
 * 5. Store in maps: mapX[y][x] = x_input, mapY[y][x] = y_input
 *
 * Why two separate maps?
 * - OpenCV remap() wants separate X and Y coordinate maps
 * - This format allows for arbitrary transformations (not just our dewarping)
 *
 * The maps are CV_32FC1 (32-bit float, single channel) to allow sub-pixel accuracy.
 */
export function generateDewarpMaps(
  cv: OpenCVRemap,
  sheetParams: CubicSheetParams,
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number,
  progressCallback?: DewarpProgressCallback
): { mapX: Mat; mapY: Mat } {
  if (progressCallback) {
    progressCallback("Remapping", 70, "Generating transformation maps");
  }

  const mapX = new cv.Mat(outputHeight, outputWidth, cv.Mat.CV_32FC1);
  const mapY = new cv.Mat(outputHeight, outputWidth, cv.Mat.CV_32FC1);

  const focalLength = Math.max(sourceWidth, sourceHeight);

  for (let y = 0; y < outputHeight; y++) {
    for (let x = 0; x < outputWidth; x++) {
      const normX = (x - outputWidth / 2) / outputWidth;
      const normY = (y - outputHeight / 2) / outputHeight;

      const z = evaluateCubicPolynomial(normX, normY, sheetParams.coefficients);

      const point3D: Point3D = {
        x: normX * sourceWidth,
        y: normY * sourceHeight,
        z: z * sourceWidth,
      };

      const projected = project3DTo2D(point3D, focalLength, {
        x: sourceWidth / 2,
        y: sourceHeight / 2,
      });

      const idx = y * outputWidth + x;
      mapX.data32F[idx] = projected.x;
      mapY.data32F[idx] = projected.y;
    }

    if (y % 50 === 0 && progressCallback) {
      const progress = 70 + (y / outputHeight) * 15;
      progressCallback(
        "Remapping",
        progress,
        `Generating maps: ${Math.floor((y / outputHeight) * 100)}%`
      );
    }
  }

  if (progressCallback) {
    progressCallback("Remapping", 85, "Transformation maps generated");
  }

  return { mapX, mapY };
}

/**
 * Apply dewarping transformation to image.
 */
export function applyDewarp(
  cv: OpenCVRemap,
  src: Mat,
  mapX: Mat,
  mapY: Mat,
  applyThreshold: boolean,
  progressCallback?: DewarpProgressCallback
): Mat {
  if (progressCallback) {
    progressCallback("Remapping", 85, "Applying transformation");
  }

  const dewarped = new cv.Mat();

  cv.remap(
    src,
    dewarped,
    mapX,
    mapY,
    cv.INTER_CUBIC,
    cv.BORDER_CONSTANT,
    new cv.Scalar(255, 255, 255, 255)
  );

  if (progressCallback) {
    progressCallback("Remapping", 90, "Transformation applied");
  }

  if (applyThreshold) {
    if (progressCallback) {
      progressCallback("Remapping", 92, "Applying adaptive threshold");
    }

    const gray = new cv.Mat();
    const thresholded = new cv.Mat();

    try {
      cv.cvtColor(dewarped, gray, cv.COLOR_RGBA2GRAY);

      cv.adaptiveThreshold(
        gray,
        thresholded,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY,
        11,
        2
      );

      cv.cvtColor(thresholded, dewarped, cv.COLOR_GRAY2RGBA);
    } finally {
      gray.delete();
      thresholded.delete();
    }

    if (progressCallback) {
      progressCallback("Remapping", 95, "Threshold applied");
    }
  }

  return dewarped;
}

/**
 * Generate debug visualizations for remapping.
 */
export function generateRemapDebugData(
  cv: OpenCVRemap,
  src: Mat,
  dewarped: Mat,
  sheetParams: CubicSheetParams,
  mapX: Mat,
  mapY: Mat,
  collectDebugData: boolean
):
  | {
      meshGrid?: DataUrl;
      beforeAfter?: DataUrl;
      surfaceMesh?: DataUrl;
      remapStats: {
        resolution: { width: number; height: number };
        interpolation: string;
      };
    }
  | undefined {
  if (!collectDebugData) {
    return {
      remapStats: {
        resolution: { width: dewarped.cols, height: dewarped.rows },
        interpolation: "INTER_CUBIC",
      },
    };
  }

  const meshGrid = visualizeMeshGrid(cv, src, mapX, mapY);
  const beforeAfter = createBeforeAfter(cv, src, dewarped);
  const surfaceMesh = visualizeSurfaceMesh(cv, src, sheetParams);

  return {
    meshGrid,
    beforeAfter,
    surfaceMesh,
    remapStats: {
      resolution: { width: dewarped.cols, height: dewarped.rows },
      interpolation: "INTER_CUBIC",
    },
  };
}

/**
 * Visualize mesh grid showing warp field.
 */
function visualizeMeshGrid(
  cv: OpenCVRemap,
  src: Mat,
  mapX: Mat,
  mapY: Mat
): DataUrl {
  const visualization = new cv.Mat();
  src.copyTo(visualization);
  const gridSpacing = 30;
  const color = new cv.Scalar(0, 255, 255, 255);

  for (let y = 0; y < mapY.rows; y += gridSpacing) {
    for (let x = 0; x < mapX.cols - 1; x += gridSpacing) {
      const idx1 = y * mapX.cols + x;
      const idx2 = y * mapX.cols + x + gridSpacing;

      if (idx2 < mapX.data32F.length) {
        const x1 = mapX.data32F[idx1];
        const y1 = mapY.data32F[idx1];
        const x2 = mapX.data32F[idx2];
        const y2 = mapY.data32F[idx2];

        if (
          x1 >= 0 &&
          x1 < src.cols &&
          y1 >= 0 &&
          y1 < src.rows &&
          x2 >= 0 &&
          x2 < src.cols &&
          y2 >= 0 &&
          y2 < src.rows
        ) {
          cv.line(visualization, { x: x1, y: y1 }, { x: x2, y: y2 }, color, 1);
        }
      }
    }
  }

  for (let x = 0; x < mapX.cols; x += gridSpacing) {
    for (let y = 0; y < mapY.rows - 1; y += gridSpacing) {
      const idx1 = y * mapX.cols + x;
      const idx2 = (y + gridSpacing) * mapX.cols + x;

      if (idx2 < mapX.data32F.length) {
        const x1 = mapX.data32F[idx1];
        const y1 = mapY.data32F[idx1];
        const x2 = mapX.data32F[idx2];
        const y2 = mapY.data32F[idx2];

        if (
          x1 >= 0 &&
          x1 < src.cols &&
          y1 >= 0 &&
          y1 < src.rows &&
          x2 >= 0 &&
          x2 < src.cols &&
          y2 >= 0 &&
          y2 < src.rows
        ) {
          cv.line(visualization, { x: x1, y: y1 }, { x: x2, y: y2 }, color, 1);
        }
      }
    }
  }

  const result = matToDataUrl(cv, visualization);
  visualization.delete();

  return result;
}

/**
 * Create before/after side-by-side comparison.
 */
function createBeforeAfter(cv: OpenCVRemap, src: Mat, dewarped: Mat): DataUrl {
  const resized = new cv.Mat();
  cv.resize(
    dewarped,
    resized,
    new cv.Size(src.cols, src.rows),
    0,
    0,
    cv.INTER_LINEAR
  );

  const combined = new cv.Mat();
  cv.hconcat([src, resized], combined);

  const result = matToDataUrl(cv, combined);

  resized.delete();
  combined.delete();

  return result;
}

/**
 * Visualize 3D surface mesh projection.
 */
function visualizeSurfaceMesh(
  cv: OpenCVRemap,
  src: Mat,
  sheetParams: CubicSheetParams
): DataUrl {
  const visualization = new cv.Mat();
  src.copyTo(visualization);
  const color = new cv.Scalar(255, 0, 255, 255);

  const focalLength = Math.max(src.cols, src.rows);

  for (let normY = -0.5; normY <= 0.5; normY += 0.1) {
    for (let normX = -0.5; normX <= 0.5; normX += 0.1) {
      const z = evaluateCubicPolynomial(normX, normY, sheetParams.coefficients);

      const point3D: Point3D = {
        x: normX * src.cols,
        y: normY * src.rows,
        z: z * src.cols,
      };

      const projected = project3DTo2D(point3D, focalLength, {
        x: src.cols / 2,
        y: src.rows / 2,
      });

      if (
        projected.x >= 0 &&
        projected.x < src.cols &&
        projected.y >= 0 &&
        projected.y < src.rows
      ) {
        cv.circle(visualization, projected, 2, color, -1);
      }
    }
  }

  const result = matToDataUrl(cv, visualization);
  visualization.delete();

  return result;
}

/**
 * Convert Mat to data URL.
 */
function matToDataUrl(cv: OpenCVRemap, mat: Mat): DataUrl {
  const canvas = document.createElement("canvas");
  cv.imshow(canvas, mat);
  return canvas.toDataURL("image/png") as DataUrl;
}

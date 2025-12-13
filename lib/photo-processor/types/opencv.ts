/**
 * Centralized OpenCV.js type definitions
 * This file contains comprehensive types for all OpenCV functionality used across the photo processor
 */

/** OpenCV Mat (matrix/image) interface with all used properties and methods */
export interface CVMat {
  rows: number;
  cols: number;
  channels(): number;
  data: Uint8Array;
  data32S: Int32Array;
  data32F: Float32Array;
  clone(): CVMat;
  delete(): void;
  isDeleted(): boolean;
  copyTo(dst: CVMat): void;
  floatPtr(row: number, col: number): Float32Array;
  intPtr(row: number, col: number): Int32Array;
  doubleAt(row: number, col: number): number;
  create(rows: number, cols: number, type: number): void;
}

/** OpenCV MatVector (array of matrices) */
export interface CVMatVector {
  push_back(mat: CVMat): void;
  size(): number;
  get(index: number): CVMat;
  delete(): void;
}

/** OpenCV Size */
export interface CVSize {
  width: number;
  height: number;
}

/** OpenCV Point */
export interface CVPoint {
  x: number;
  y: number;
}

/** OpenCV Scalar (color/value) */
export interface CVScalar {
  [index: number]: number;
}

/** OpenCV Rect (bounding box) */
export interface CVRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** OpenCV Moments (shape descriptors) */
export interface CVMoments {
  m00: number;
  m10: number;
  m01: number;
  mu20: number;
  mu11: number;
  mu02: number;
}

/** OpenCV CLAHE interface */
export interface CVCLAHE {
  apply(src: CVMat, dst: CVMat): void;
  delete(): void;
}

/** Comprehensive OpenCV.js interface with all methods used in this codebase */
export interface CV {
  // Constructors
  Mat: {
    new (): CVMat;
    zeros(rows: number, cols: number, type: number): CVMat;
  };
  MatVector: new () => CVMatVector;
  Size: new (width: number, height: number) => CVSize;
  Point: new (x: number, y: number) => CVPoint;
  Scalar: new (...values: Array<number>) => CVScalar;
  CLAHE: new (clipLimit: number, tileGridSize: CVSize) => CVCLAHE;

  // Image loading/conversion
  matFromImageData(imageData: ImageData): CVMat;
  matFromArray(
    rows: number,
    cols: number,
    type: number,
    data: Array<number>
  ): CVMat;
  imshow(canvas: HTMLCanvasElement, mat: CVMat): void;

  // Color conversion
  cvtColor(src: CVMat, dst: CVMat, code: number): void;
  COLOR_RGBA2BGR: number;
  COLOR_RGB2GRAY: number;
  COLOR_BGR2GRAY: number;
  COLOR_GRAY2BGR: number;
  COLOR_GRAY2RGBA: number;
  COLOR_RGB2RGBA: number;
  COLOR_RGBA2GRAY: number;
  COLOR_BGR2Lab: number;
  COLOR_Lab2BGR: number;

  // Image processing
  GaussianBlur(
    src: CVMat,
    dst: CVMat,
    ksize: CVSize,
    sigmaX: number,
    sigmaY?: number
  ): void;
  bilateralFilter(
    src: CVMat,
    dst: CVMat,
    d: number,
    sigmaColor: number,
    sigmaSpace: number
  ): void;
  adaptiveThreshold(
    src: CVMat,
    dst: CVMat,
    maxValue: number,
    adaptiveMethod: number,
    thresholdType: number,
    blockSize: number,
    C: number
  ): void;
  resize(
    src: CVMat,
    dst: CVMat,
    dsize: CVSize,
    fx: number,
    fy: number,
    interpolation: number
  ): void;
  remap(
    src: CVMat,
    dst: CVMat,
    map1: CVMat,
    map2: CVMat,
    interpolation: number,
    borderMode: number
  ): void;

  // Morphological operations
  getStructuringElement(shape: number, ksize: CVSize): CVMat;
  dilate(src: CVMat, dst: CVMat, kernel: CVMat): void;
  erode(
    src: CVMat,
    dst: CVMat,
    kernel: CVMat,
    anchor?: CVPoint,
    iterations?: number
  ): void;

  // Arithmetic operations
  divide(src1: CVMat, src2: CVMat, dst: CVMat, scale?: number): void;
  multiply(src1: CVMat, src2: number | CVScalar, dst: CVMat): void;
  add(src1: CVMat, src2: CVMat, dst: CVMat): void;
  subtract(src1: CVMat, src2: CVMat, dst: CVMat): void;
  addWeighted(
    src1: CVMat,
    alpha: number,
    src2: CVMat,
    beta: number,
    gamma: number,
    dst: CVMat
  ): void;
  convertScaleAbs(
    src: CVMat,
    dst: CVMat,
    alpha?: number,
    beta?: number
  ): void;

  // Logical operations
  bitwise_and(src1: CVMat, src2: CVMat, dst: CVMat): void;

  // Statistical operations
  mean(src: CVMat): CVScalar;
  minMaxLoc(src: CVMat): { maxVal: number; minVal?: number };
  reduce(src: CVMat, dst: CVMat, dim: number, rtype: number, dtype: number): void;

  // Channel operations
  split(src: CVMat, dst: CVMatVector): void;
  merge(src: CVMatVector, dst: CVMat): void;

  // Contour operations
  findContours(
    image: CVMat,
    contours: CVMatVector,
    hierarchy: CVMat,
    mode: number,
    method: number
  ): void;
  boundingRect(contour: CVMat): CVRect;
  moments(contour: CVMat): CVMoments;
  drawContours(
    image: CVMat,
    contours: CVMatVector,
    contourIdx: number,
    color: CVScalar,
    thickness: number,
    lineType?: number,
    hierarchy?: CVMat,
    maxLevel?: number,
    offset?: CVPoint
  ): void;

  // Geometric transformations
  rectangle(
    img: CVMat,
    pt1: CVPoint,
    pt2: CVPoint,
    color: CVScalar,
    thickness: number
  ): void;
  findHomography(src: CVMat, dst: CVMat): CVMat;
  Rodrigues(src: CVMat, dst: CVMat): void;

  // Constants - Color conversion
  ADAPTIVE_THRESH_MEAN_C: number;
  ADAPTIVE_THRESH_GAUSSIAN_C: number;
  THRESH_BINARY: number;
  THRESH_BINARY_INV: number;

  // Constants - Morphology
  MORPH_RECT: number;

  // Constants - Contours
  RETR_EXTERNAL: number;
  RETR_TREE: number;
  CHAIN_APPROX_SIMPLE: number;
  CHAIN_APPROX_NONE: number;

  // Constants - Data types
  CV_8UC1: number;
  CV_8UC3: number;
  CV_8UC4: number;
  CV_32F: number;
  CV_32S: number;
  CV_32FC2: number;
  CV_64F: number;

  // Constants - Interpolation
  INTER_AREA: number;
  INTER_CUBIC: number;

  // Constants - Border modes
  BORDER_REPLICATE: number;

  // Constants - Drawing
  LINE_8: number;

  // Constants - Reduce operations
  REDUCE_SUM: number;
}

/** Extended CV interface for window.cv which includes runtime initialization */
export interface WindowCV extends CV {
  onRuntimeInitialized?: () => void;
  then?: unknown;
}


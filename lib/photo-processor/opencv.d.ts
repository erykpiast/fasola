/**
 * OpenCV type definitions for preprocessing operations.
 */

import type { Mat } from "@techstark/opencv-js";
import type { Point2D } from "./pipelines/page-dewarp-core";
import type {
  CVMatVector,
  CVScalar,
  CVSize,
} from "./pipelines/page-dewarp-remap";

export interface OpenCVPreprocessing {
  Mat: new () => Mat;
  MatVector: new () => CVMatVector;
  cvtColor: (src: Mat, dst: Mat, code: number) => void;
  equalizeHist: (src: Mat, dst: Mat) => void;
  GaussianBlur: (src: Mat, dst: Mat, ksize: CVSize, sigmaX: number) => void;
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
    contours: CVMatVector,
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
  boundingRect: (contour: Mat) => {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  contourArea: (contour: Mat, oriented?: boolean) => number;
  arcLength: (curve: Mat, closed: boolean) => number;
  approxPolyDP: (
    curve: Mat,
    approxCurve: Mat,
    epsilon: number,
    closed: boolean
  ) => void;
  getStructuringElement: (shape: number, size: CVSize) => Mat;
  imshow: (canvas: HTMLCanvasElement, mat: Mat) => void;
  line: (
    img: Mat,
    pt1: Point2D,
    pt2: Point2D,
    color: CVScalar,
    thickness?: number
  ) => void;
  rectangle: (
    img: Mat,
    pt1: Point2D,
    pt2: Point2D,
    color: CVScalar,
    thickness?: number
  ) => void;
  polylines: (
    img: Mat,
    pts: CVMatVector,
    isClosed: boolean,
    color: CVScalar,
    thickness?: number,
    lineType?: number,
    shift?: number
  ) => void;
  circle: (
    img: Mat,
    center: Point2D,
    radius: number,
    color: CVScalar,
    thickness?: number
  ) => void;
  fillPoly: (img: Mat, pts: CVMatVector, color: CVScalar) => void;
  putText: (
    img: Mat,
    text: string,
    org: Point2D,
    fontFace: number,
    fontScale: number,
    color: CVScalar,
    thickness?: number
  ) => void;
  FONT_HERSHEY_SIMPLEX: number;
  matFromArray: (
    rows: number,
    cols: number,
    type: number,
    data: Array<number>
  ) => Mat;
  fitLine: (
    points: Mat,
    line: Mat,
    distType: number,
    param: number,
    reps: number,
    aeps: number
  ) => void;
  CV_32SC2: number;
  CV_32FC2: number;
  DIST_L2: number;
  COLOR_RGBA2GRAY: number;
  ADAPTIVE_THRESH_GAUSSIAN_C: number;
  THRESH_BINARY: number;
  THRESH_BINARY_INV: number;
  RETR_EXTERNAL: number;
  RETR_TREE: number;
  CHAIN_APPROX_SIMPLE: number;
  MORPH_RECT: number;
  Size: new (width: number, height: number) => CVSize;
  Scalar: new (...values: Array<number>) => CVScalar;
}

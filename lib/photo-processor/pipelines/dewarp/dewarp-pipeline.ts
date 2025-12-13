import type { DataUrl } from "@/lib/types/primitives";
import { Config } from "./config";
import { type ContourInfo } from "./contours";
import { Mask } from "./mask";
import { minimize, optimiseParams } from "./optimise";
import { projectXY } from "./projection";
import { getDefaultParams } from "./solve";
import { assembleSpans, keypointsFromSamples, sampleSpans } from "./spans";
import {
  imgsize,
  loadImageMat,
  matToDataUrl,
  norm2pix,
  roundNearestMultiple,
} from "./utils";

export interface DewarpConfig {
  xMargin?: number;
  yMargin?: number;
  outputZoom?: number;
  noBinary?: boolean;
}

interface Mat {
  rows: number;
  cols: number;
  clone(): Mat;
  delete(): void;
  isDeleted(): boolean;
  floatPtr(row: number, col: number): Float32Array;
  channels(): number;
  data: Uint8Array;
  copyTo(dst: Mat): void;
}

interface Size {
  new (width: number, height: number): Size;
}

interface Point {
  new (x: number, y: number): Point;
}

interface Scalar {
  new (...args: Array<number>): Scalar;
}

interface CV {
  Mat: {
    new (): Mat;
    zeros(rows: number, cols: number, type: number): Mat;
  };
  MatVector: new () => unknown;
  Size: Size;
  Point: Point;
  Scalar: Scalar;
  cvtColor(src: Mat, dst: Mat, code: number): void;
  resize(
    src: Mat,
    dst: Mat,
    dsize: Size,
    fx: number,
    fy: number,
    interpolation: number
  ): void;
  rectangle(
    img: Mat,
    pt1: Point,
    pt2: Point,
    color: Scalar,
    thickness: number
  ): void;
  remap(
    src: Mat,
    dst: Mat,
    map1: Mat,
    map2: Mat,
    interpolation: number,
    borderMode: number
  ): void;
  adaptiveThreshold(
    src: Mat,
    dst: Mat,
    maxValue: number,
    adaptiveMethod: number,
    thresholdType: number,
    blockSize: number,
    C: number
  ): void;
  getStructuringElement(shape: number, ksize: Size): Mat;
  dilate(src: Mat, dst: Mat, kernel: Mat): void;
  erode(
    src: Mat,
    dst: Mat,
    kernel: Mat,
    anchor?: Point,
    iterations?: number
  ): void;
  bitwise_and(src1: Mat, src2: Mat, dst: Mat): void;
  COLOR_RGBA2BGR: number;
  COLOR_RGB2GRAY: number;
  CV_8UC1: number;
  CV_32F: number;
  INTER_AREA: number;
  INTER_CUBIC: number;
  BORDER_REPLICATE: number;
  ADAPTIVE_THRESH_MEAN_C: number;
  THRESH_BINARY: number;
}

function linspace(start: number, end: number, num: number): Array<number> {
  if (num < 2) return num === 1 ? [start] : [];
  const step = (end - start) / (num - 1);
  const arr: Array<number> = [];
  for (let i = 0; i < num; i++) arr.push(start + i * step);
  return arr;
}

function computeOutputDimensions(
  pageDims: [number, number],
  imgRows: number,
  outputZoom: number
): {
  width: number;
  height: number;
  widthSmall: number;
  heightSmall: number;
} {
  const [pageWidthNorm, pageHeightNorm] = pageDims;

  let height = 0.5 * pageHeightNorm * outputZoom * imgRows;
  height = roundNearestMultiple(height, Config.REMAP_DECIMATE);

  let width = roundNearestMultiple(
    (height * pageWidthNorm) / pageHeightNorm,
    Config.REMAP_DECIMATE
  );

  const MAX_DIM = 3000;
  if (width > MAX_DIM || height > MAX_DIM) {
    const scale = MAX_DIM / Math.max(width, height);
    width = roundNearestMultiple(width * scale, Config.REMAP_DECIMATE);
    height = roundNearestMultiple(height * scale, Config.REMAP_DECIMATE);
    console.log(`  clamping output to ${width}x${height}`);
  }

  console.log(`  output will be ${width}x${height}`);

  const heightSmall = Math.floor(height / Config.REMAP_DECIMATE);
  const widthSmall = Math.floor(width / Config.REMAP_DECIMATE);

  return { width, height, widthSmall, heightSmall };
}

function buildRemapMaps(
  cv: CV,
  widthSmall: number,
  heightSmall: number,
  pageDims: [number, number],
  params: Array<number>,
  img: Mat
): { mapX: Mat; mapY: Mat; mapXSmall: Mat; mapYSmall: Mat } {
  const [pageWidthNorm, pageHeightNorm] = pageDims;

  const pageXRange = linspace(0, pageWidthNorm, widthSmall);
  const pageYRange = linspace(0, pageHeightNorm, heightSmall);

  const pageXYCoords: Array<[number, number]> = [];
  for (const y of pageYRange) {
    for (const x of pageXRange) {
      pageXYCoords.push([x, y]);
    }
  }

  const projPoints = projectXY(cv as any, pageXYCoords, params);
  const imagePoints = norm2pix(img, projPoints, false);

  const mapXSmall = new cv.Mat();
  (mapXSmall as any).create(heightSmall, widthSmall, cv.CV_32F);
  const mapYSmall = new cv.Mat();
  (mapYSmall as any).create(heightSmall, widthSmall, cv.CV_32F);

  let invalidPointCount = 0;
  for (let i = 0; i < imagePoints.length; i++) {
    const row = Math.floor(i / widthSmall);
    const col = i % widthSmall;

    if (row < heightSmall && col < widthSmall) {
      let x = imagePoints[i][0];
      let y = imagePoints[i][1];

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        invalidPointCount++;
        x = 0;
        y = 0;
      }

      const MAX_COORD = 100000;
      if (x > MAX_COORD) x = MAX_COORD;
      if (x < -MAX_COORD) x = -MAX_COORD;
      if (y > MAX_COORD) y = MAX_COORD;
      if (y < -MAX_COORD) y = -MAX_COORD;

      mapXSmall.floatPtr(row, col)[0] = x;
      mapYSmall.floatPtr(row, col)[0] = y;
    }
  }

  if (invalidPointCount > 0) {
    console.warn(
      `  WARNING: Found ${invalidPointCount} NaN/Inf points in projection. Replaced with 0.`
    );
  }

  const mapX = new cv.Mat();
  const mapY = new cv.Mat();
  const dsize = new cv.Size(
    widthSmall * Config.REMAP_DECIMATE,
    heightSmall * Config.REMAP_DECIMATE
  );
  cv.resize(mapXSmall, mapX, dsize, 0, 0, cv.INTER_CUBIC);
  cv.resize(mapYSmall, mapY, dsize, 0, 0, cv.INTER_CUBIC);

  return { mapX, mapY, mapXSmall, mapYSmall };
}

function applyRemapAndThreshold(
  cv: CV,
  img: Mat,
  mapX: Mat,
  mapY: Mat,
  width: number,
  height: number,
  noBinary: boolean
): Mat {
  const imgGray = new cv.Mat();
  cv.cvtColor(img, imgGray, cv.COLOR_RGB2GRAY);

  const remapped = new cv.Mat();
  cv.remap(imgGray, remapped, mapX, mapY, cv.INTER_CUBIC, cv.BORDER_REPLICATE);

  imgGray.delete();

  let result: Mat;
  if (noBinary) {
    result = remapped;
  } else {
    const thresh = new cv.Mat();
    cv.adaptiveThreshold(
      remapped,
      thresh,
      255,
      cv.ADAPTIVE_THRESH_MEAN_C,
      cv.THRESH_BINARY,
      Config.ADAPTIVE_WINSZ,
      25
    );
    result = thresh;
    remapped.delete();
  }

  return result;
}

/**
 * Common dewarping pipeline that processes images using OpenCV
 */
export async function processDewarp(
  cv: CV,
  imageDataUrl: DataUrl,
  config: DewarpConfig = {}
): Promise<DataUrl> {
  console.log("[DewarpPipeline] Processing image with OpenCV:", {
    cvAvailable: !!cv,
    hasMat: !!(cv && cv.Mat),
    config,
  });

  const xMargin = config.xMargin ?? Config.PAGE_MARGIN_X;
  const yMargin = config.yMargin ?? Config.PAGE_MARGIN_Y;
  const outputZoom = config.outputZoom ?? Config.OUTPUT_ZOOM;
  const noBinary = config.noBinary ?? Config.NO_BINARY !== 0;

  console.log("  Loading image...");
  const cv2_img = await loadImageMat(cv as any, imageDataUrl);

  const bgr = new cv.Mat();
  cv.cvtColor(cv2_img as any, bgr, cv.COLOR_RGBA2BGR);
  (cv2_img as any).delete();

  const small = resizeToScreen(cv, bgr);
  console.log(`  Loaded image at ${imgsize(bgr)} --> ${imgsize(small)}`);

  console.log("  Calculating page extents...");
  const { pagemask, page_outline } = calculatePageExtents(
    cv,
    small,
    xMargin,
    yMargin
  );

  console.log("  Detecting contours...");
  let contour_list = contourInfo(cv, "dewarp", small, pagemask, true);
  console.log(`  Found ${contour_list.length} initial text contours`);

  console.log("  Assembling spans...");
  let spans = iterativelyAssembleSpans(
    cv,
    "dewarp",
    small,
    pagemask,
    contour_list
  );

  if (spans.length < 1) {
    console.log(`skipping because only ${spans.length} spans`);
    bgr.delete();
    small.delete();
    pagemask.delete();
    contour_list.forEach((c) => c.destroy());
    return imageDataUrl;
  }

  console.log("  Sampling spans...");
  const spanPoints = sampleSpans(small, spans);
  const nPts = spanPoints.reduce((a, b) => a + b.length, 0);
  console.log(`  got ${spans.length} spans with ${nPts} points.`);

  console.log("  Getting keypoints...");
  const { corners, ycoords, xcoords } = keypointsFromSamples(
    "dewarp",
    small,
    pagemask,
    page_outline,
    spanPoints
  );

  console.log("  Getting default params...");
  let {
    pageDims: roughDims,
    spanCounts,
    params,
  } = getDefaultParams(cv, corners, ycoords, xcoords);

  console.log("  Optimizing params...");
  const dstpoints: Array<[number, number]> = [corners[0]].concat(
    spanPoints.flat()
  );

  params = await optimiseParams(
    cv,
    "dewarp",
    small,
    dstpoints,
    spanCounts,
    params
  );

  console.log("  Optimizing page dims...");
  let pageDims = await getPageDims(cv, corners, roughDims, params);

  if (pageDims[0] < 0 || pageDims[1] < 0) {
    console.log(
      "Got a negative page dimension! Falling back to rough estimate"
    );
    pageDims = roughDims;
  }

  console.log("  Thresholding/Remapping...");
  const result = await threshold(
    cv,
    bgr,
    pageDims,
    params,
    outputZoom,
    noBinary
  );

  bgr.delete();
  small.delete();
  pagemask.delete();
  contour_list.forEach((c) => c.destroy());

  console.log("  Done.");
  return result;
}

function resizeToScreen(cv: CV, img: Mat): Mat {
  const { rows: height, cols: width } = img;
  const scl_x = width / Config.SCREEN_MAX_W;
  const scl_y = height / Config.SCREEN_MAX_H;
  const scl = Math.ceil(Math.max(scl_x, scl_y));

  if (scl > 1.0) {
    const inv_scl = 1.0 / scl;
    const dst = new cv.Mat();
    cv.resize(img, dst, new cv.Size(0, 0), inv_scl, inv_scl, cv.INTER_AREA);
    return dst;
  }
  return img.clone();
}

function calculatePageExtents(
  cv: CV,
  small: Mat,
  xMargin: number,
  yMargin: number
): { pagemask: Mat; page_outline: Array<[number, number]> } {
  const { rows: height, cols: width } = small;
  const xmin = xMargin;
  const ymin = yMargin;
  const xmax = width - xmin;
  const ymax = height - ymin;

  const pagemask = cv.Mat.zeros(height, width, cv.CV_8UC1);

  const pt1 = new cv.Point(xmin, ymin);
  const pt2 = new cv.Point(xmax, ymax);
  const color = new cv.Scalar(255);
  cv.rectangle(pagemask, pt1, pt2, color, -1);

  const page_outline: Array<[number, number]> = [
    [xmin, ymin],
    [xmin, ymax],
    [xmax, ymax],
    [xmax, ymin],
  ];

  return { pagemask, page_outline };
}

function contourInfo(
  cv: CV,
  name: string,
  small: Mat,
  pagemask: Mat,
  text: boolean
): Array<ContourInfo> {
  const mask = new Mask(cv as any, name, small as any, pagemask as any, text);
  const contours = mask.contours();
  mask.destroy();
  return contours;
}

function iterativelyAssembleSpans(
  cv: CV,
  name: string,
  small: Mat,
  pagemask: Mat,
  contour_list: Array<ContourInfo>
): Array<Array<ContourInfo>> {
  let result = assembleSpans(name, small, pagemask, contour_list);
  if (result.spans.length < 3) {
    console.log(
      `  detecting lines because only ${result.spans.length} text spans`
    );
    const lineContours = contourInfo(cv, name, small, pagemask, false);
    const newResult = attemptReassembleSpans(
      name,
      small,
      pagemask,
      lineContours,
      result
    );
    return newResult.spans;
  }
  return result.spans;
}

function attemptReassembleSpans(
  name: string,
  small: Mat,
  pagemask: Mat,
  contour_list: Array<ContourInfo>,
  prevResult: { spans: Array<Array<ContourInfo>> }
): { spans: Array<Array<ContourInfo>> } {
  const newResult = assembleSpans(name, small, pagemask, contour_list);
  return newResult.spans.length > prevResult.spans.length
    ? newResult
    : prevResult;
}

async function getPageDims(
  cv: CV,
  corners: Array<[number, number]>,
  roughDims: [number, number],
  params: Array<number>
): Promise<[number, number]> {
  const dst_br = corners[2];

  function objective(dimsLocal: Float64Array): number {
    const pts: Array<[number, number]> = [[dimsLocal[0], dimsLocal[1]]];
    const proj = projectXY(cv as any, pts, params);
    const p = proj[0];
    return Math.pow(dst_br[0] - p[0], 2) + Math.pow(dst_br[1] - p[1], 2);
  }

  const sol = minimize(objective, Array.from(roughDims), {
    maxIter: 100,
    tol: 1e-6,
  });
  const newDims: [number, number] = [sol.x[0], sol.x[1]];
  console.log(`  got page dims ${newDims[0]} x ${newDims[1]}`);
  return newDims;
}

async function threshold(
  cv: CV,
  img: Mat,
  pageDims: [number, number],
  params: Array<number>,
  outputZoom: number,
  noBinary: boolean
): Promise<DataUrl> {
  const { width, height, widthSmall, heightSmall } = computeOutputDimensions(
    pageDims,
    img.rows,
    outputZoom
  );

  const { mapX, mapY, mapXSmall, mapYSmall } = buildRemapMaps(
    cv,
    widthSmall,
    heightSmall,
    pageDims,
    params,
    img
  );

  const result = applyRemapAndThreshold(
    cv,
    img,
    mapX,
    mapY,
    width,
    height,
    noBinary
  );

  const dataUrl = matToDataUrl(cv as any, result as any);

  mapXSmall.delete();
  mapYSmall.delete();
  mapX.delete();
  mapY.delete();
  result.delete();

  return dataUrl;
}

import { Config } from "./config";

interface Mat {
  rows: number;
  cols: number;
  intPtr(row: number, col: number): Int32Array;
  clone(): Mat;
  delete(): void;
  isDeleted(): boolean;
  zeros(rows: number, cols: number, type: number): Mat;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Moments {
  m00: number;
  m10: number;
  m01: number;
  mu20: number;
  mu11: number;
  mu02: number;
}

interface Point {
  new (x: number, y: number): Point;
}

interface Scalar {
  new (...args: Array<number>): Scalar;
}

interface CV {
  Mat: new () => Mat;
  MatVector: new () => MatVector;
  Point: Point;
  Scalar: Scalar;
  moments(contour: Mat): Moments;
  boundingRect(contour: Mat): Rect;
  findContours(
    image: Mat,
    contours: MatVector,
    hierarchy: Mat,
    mode: number,
    method: number
  ): void;
  drawContours(
    image: Mat,
    contours: MatVector,
    contourIdx: number,
    color: Scalar,
    thickness: number,
    lineType?: number,
    hierarchy?: Mat,
    maxLevel?: number,
    offset?: Point
  ): void;
  reduce(
    src: Mat,
    dst: Mat,
    dim: number,
    rtype: number,
    dtype: number
  ): void;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_NONE: number;
  CV_8UC1: number;
  CV_32S: number;
  LINE_8: number;
}

interface MatVector {
  push_back(mat: Mat): void;
  size(): number;
  get(index: number): Mat;
  delete(): void;
}

export interface ContourInfo {
  contour: Mat;
  rect: Rect;
  mask: Mat;
  center: [number, number];
  tangent: [number, number];
  angle: number;
  local_xrng: [number, number];
  point0: [number, number];
  point1: [number, number];
  pred: ContourInfo | null;
  succ: ContourInfo | null;
  getPoints(): Array<[number, number]>;
  projX(point: [number, number]): number;
  localOverlap(other: ContourInfo): number;
  destroy(): void;
}

class ContourInfoImpl implements ContourInfo {
  contour: Mat;
  rect: Rect;
  mask: Mat;
  center: [number, number];
  tangent: [number, number];
  angle: number;
  local_xrng: [number, number];
  point0: [number, number];
  point1: [number, number];
  pred: ContourInfo | null = null;
  succ: ContourInfo | null = null;
  private cv: CV;

  constructor(cv: CV, contour: Mat, moments: { center: [number, number]; tangent: [number, number] }, rect: Rect, mask: Mat) {
    this.cv = cv;
    this.contour = contour;
    this.rect = rect;
    this.mask = mask;
    this.center = moments.center;
    this.tangent = moments.tangent;

    this.angle = Math.atan2(this.tangent[1], this.tangent[0]);

    const pts = this.getPoints();
    const projectedXCoords = pts.map((p) => this.projX(p));
    const localXMin = Math.min(...projectedXCoords);
    const localXMax = Math.max(...projectedXCoords);

    this.local_xrng = [localXMin, localXMax];

    this.point0 = [
      this.center[0] + this.tangent[0] * localXMin,
      this.center[1] + this.tangent[1] * localXMin,
    ];

    this.point1 = [
      this.center[0] + this.tangent[0] * localXMax,
      this.center[1] + this.tangent[1] * localXMax,
    ];
  }

  getPoints(): Array<[number, number]> {
    const points: Array<[number, number]> = [];
    for (let i = 0; i < this.contour.rows; i++) {
      const x = this.contour.intPtr(i, 0)[0];
      const y = this.contour.intPtr(i, 0)[1];
      points.push([x, y]);
    }
    return points;
  }

  projX(point: [number, number]): number {
    const dx = point[0] - this.center[0];
    const dy = point[1] - this.center[1];
    return this.tangent[0] * dx + this.tangent[1] * dy;
  }

  localOverlap(other: ContourInfo): number {
    const xmin = this.projX(other.point0);
    const xmax = this.projX(other.point1);
    return intervalMeasureOverlap(this.local_xrng, [xmin, xmax]);
  }

  destroy(): void {
    if (this.contour && !this.contour.isDeleted()) {
      this.contour.delete();
    }
    if (this.mask && !this.mask.isDeleted()) {
      this.mask.delete();
    }
  }
}

function intervalMeasureOverlap(int_a: [number, number], int_b: [number, number]): number {
  return Math.min(int_a[1], int_b[1]) - Math.max(int_a[0], int_b[0]);
}

/**
 * Calculates center of mass and principal axis orientation using image moments.
 */
export function blobMeanAndTangent(cv: CV, contour: Mat): { center: [number, number]; tangent: [number, number] } | null {
  const moments = cv.moments(contour);
  const area = moments.m00;

  if (area === 0) return null;

  const mean_x = moments.m10 / area;
  const mean_y = moments.m01 / area;

  const mu20 = moments.mu20 / area;
  const mu11 = moments.mu11 / area;
  const mu02 = moments.mu02 / area;

  const T = mu20 + mu02;
  const D = mu20 * mu02 - mu11 * mu11;

  const L1 = T / 2 + Math.sqrt(Math.max(0, (T * T) / 4 - D));

  let tangentX: number;
  let tangentY: number;
  if (Math.abs(mu11) > 1e-9) {
    const diff = mu20 - L1;
    const theta = Math.atan2(-diff, mu11);
    tangentX = Math.cos(theta);
    tangentY = Math.sin(theta);
  } else {
    if (mu20 >= mu02) {
      tangentX = 1;
      tangentY = 0;
    } else {
      tangentX = 0;
      tangentY = 1;
    }
  }

  return {
    center: [mean_x, mean_y],
    tangent: [tangentX, tangentY],
  };
}

/**
 * Creates a cropped binary mask for a contour.
 */
export function makeTightMask(
  cv: CV,
  contour: Mat,
  xmin: number,
  ymin: number,
  width: number,
  height: number
): Mat {
  const mask = cv.Mat.zeros(height, width, cv.CV_8UC1);

  const contoursVec = new cv.MatVector();
  contoursVec.push_back(contour);

  const offset = new cv.Point(-xmin, -ymin);
  const color = new cv.Scalar(1);

  cv.drawContours(
    mask,
    contoursVec,
    0,
    color,
    -1,
    cv.LINE_8,
    new cv.Mat(),
    2147483647,
    offset
  );

  contoursVec.delete();

  return mask;
}

let lastContourStats: unknown = null;
export function getLastContourStats(): unknown {
  return lastContourStats;
}

function findRawContours(cv: CV, mask: Mat): MatVector {
  const contoursVec = new cv.MatVector();
  const hierarchy = new cv.Mat();

  cv.findContours(
    mask,
    contoursVec,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_NONE
  );

  hierarchy.delete();
  return contoursVec;
}

interface RejectionStats {
  width: number;
  height: number;
  aspect: number;
  thickness: number;
  zeroMoments: number;
}

interface ContourStats {
  totalContours: number;
  acceptedContours: number;
  rejectionBreakdown: RejectionStats;
  sampleRejectedRects: Array<{ reason: string; rect: Rect }>;
}

function filterContourByGeometry(contour: Mat, rect: Rect, stats: ContourStats): { valid: boolean; reason?: string } {
  const { width, height } = rect;

  if (width < Config.TEXT_MIN_WIDTH) {
    stats.rejectionBreakdown.width++;
    if (stats.sampleRejectedRects.length < 20) {
      stats.sampleRejectedRects.push({ reason: "width", rect });
    }
    return { valid: false, reason: "width" };
  }

  if (height < Config.TEXT_MIN_HEIGHT) {
    stats.rejectionBreakdown.height++;
    if (stats.sampleRejectedRects.length < 20) {
      stats.sampleRejectedRects.push({ reason: "height", rect });
    }
    return { valid: false, reason: "height" };
  }

  if (width < Config.TEXT_MIN_ASPECT * height) {
    stats.rejectionBreakdown.aspect++;
    if (stats.sampleRejectedRects.length < 20) {
      stats.sampleRejectedRects.push({ reason: "aspect", rect });
    }
    return { valid: false, reason: "aspect" };
  }

  return { valid: true };
}

function filterContourByThickness(cv: CV, tightMask: Mat, rect: Rect, stats: ContourStats): { valid: boolean; reason?: string } {
  const colSums = new cv.Mat();
  cv.reduce(tightMask, colSums, 0, cv.REDUCE_SUM, cv.CV_32S);

  let maxThickness = 0;
  const colSumsData = (colSums as any).data32S as Int32Array;
  for (let j = 0; j < colSumsData.length; j++) {
    if (colSumsData[j] > maxThickness) maxThickness = colSumsData[j];
  }
  colSums.delete();

  if (maxThickness > Config.TEXT_MAX_THICKNESS) {
    stats.rejectionBreakdown.thickness++;
    if (stats.sampleRejectedRects.length < 20) {
      stats.sampleRejectedRects.push({ reason: "thickness", rect });
    }
    return { valid: false, reason: "thickness" };
  }

  return { valid: true };
}

/**
 * Finds and filters text contours from a binary mask.
 */
export function getContours(cv: CV, name: string, small: Mat, mask: Mat): Array<ContourInfo> {
  const contoursVec = findRawContours(cv, mask);

  const contoursOut: Array<ContourInfo> = [];
  const stats: ContourStats = {
    totalContours: contoursVec.size(),
    acceptedContours: 0,
    rejectionBreakdown: {
      width: 0,
      height: 0,
      aspect: 0,
      thickness: 0,
      zeroMoments: 0,
    },
    sampleRejectedRects: [],
  };

  for (let i = 0; i < contoursVec.size(); i++) {
    const contour = contoursVec.get(i);
    const rect = cv.boundingRect(contour);
    const { width, height, x: xmin, y: ymin } = rect;

    const geometryResult = filterContourByGeometry(contour, rect, stats);
    if (!geometryResult.valid) {
      contour.delete();
      continue;
    }

    const tightMask = makeTightMask(cv, contour, xmin, ymin, width, height);

    const thicknessResult = filterContourByThickness(cv, tightMask, rect, stats);
    if (!thicknessResult.valid) {
      tightMask.delete();
      contour.delete();
      continue;
    }

    const moments = blobMeanAndTangent(cv, contour);
    if (!moments) {
      stats.rejectionBreakdown.zeroMoments++;
      if (stats.sampleRejectedRects.length < 20) {
        stats.sampleRejectedRects.push({ reason: "moments", rect });
      }
      tightMask.delete();
      contour.delete();
      continue;
    }

    contoursOut.push(
      new ContourInfoImpl(cv, contour.clone(), moments, rect, tightMask)
    );
    stats.acceptedContours++;
    contour.delete();
  }

  contoursVec.delete();
  lastContourStats = stats;

  return contoursOut;
}


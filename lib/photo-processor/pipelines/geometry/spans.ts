import { Config } from "./config";
import { type ContourInfo } from "./contours";
import { pix2norm } from "./utils";

/**
 * Computes the absolute angular distance between two angles, normalized to [0, π].
 */
function angleDist(angleB: number, angleA: number): number {
  let diff = angleB - angleA;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return Math.abs(diff);
}

interface Edge {
  score: number;
  cinfoA: ContourInfo;
  cinfoB: ContourInfo;
}

interface SpanStats {
  candidatePairs: number;
  validEdges: number;
  rejectionBreakdown: {
    distance: number;
    overlap: number;
    angle: number;
  };
  linkedContours: number;
  spanSizes: Array<number>;
  spanWidths: Array<number>;
}

function generateCandidateEdge(
  cinfoA: ContourInfo,
  cinfoB: ContourInfo,
  statsTracker: SpanStats | null
): Edge | null {
  if (cinfoA.point0[0] > cinfoB.point1[0]) {
    [cinfoA, cinfoB] = [cinfoB, cinfoA];
  }

  const xOverlapA = cinfoA.localOverlap(cinfoB);
  const xOverlapB = cinfoB.localOverlap(cinfoA);

  const overallTangent = [
    cinfoB.center[0] - cinfoA.center[0],
    cinfoB.center[1] - cinfoA.center[1],
  ];
  const overallAngle = Math.atan2(overallTangent[1], overallTangent[0]);

  const deltaAngle =
    (Math.max(
      angleDist(cinfoA.angle, overallAngle),
      angleDist(cinfoB.angle, overallAngle)
    ) *
      180) /
    Math.PI;

  const xOverlap = Math.max(xOverlapA, xOverlapB);
  const dist = Math.sqrt(
    Math.pow(cinfoB.point0[0] - cinfoA.point1[0], 2) +
      Math.pow(cinfoB.point0[1] - cinfoA.point1[1], 2)
  );

  if (
    dist > Config.EDGE_MAX_LENGTH ||
    xOverlap > Config.EDGE_MAX_OVERLAP ||
    deltaAngle > Config.EDGE_MAX_ANGLE
  ) {
    if (statsTracker) {
      const { rejectionBreakdown } = statsTracker;
      if (dist > Config.EDGE_MAX_LENGTH) {
        rejectionBreakdown.distance++;
      } else if (xOverlap > Config.EDGE_MAX_OVERLAP) {
        rejectionBreakdown.overlap++;
      } else if (deltaAngle > Config.EDGE_MAX_ANGLE) {
        rejectionBreakdown.angle++;
      }
    }
    return null;
  }

  if (statsTracker) {
    const { validEdges } = statsTracker;
    statsTracker.validEdges = validEdges + 1;
  }

  const score = dist + deltaAngle * Config.EDGE_ANGLE_COST;
  return { score, cinfoA, cinfoB };
}

function sortContoursForAssembly(cinfoList: Array<ContourInfo>): void {
  cinfoList.sort(
    (a, b) =>
      a.rect.y - b.rect.y ||
      a.rect.x - b.rect.x ||
      a.rect.width - b.rect.width ||
      a.rect.height - b.rect.height
  );
}

function generateAllCandidateEdges(
  cinfoList: Array<ContourInfo>,
  stats: SpanStats
): Array<Edge> {
  const candidateEdges: Array<Edge> = [];

  for (let i = 0; i < cinfoList.length; i++) {
    for (let j = 0; j < i; j++) {
      stats.candidatePairs++;
      const edge = generateCandidateEdge(cinfoList[i], cinfoList[j], stats);
      if (edge) {
        candidateEdges.push(edge);
      }
    }
  }

  return candidateEdges;
}

function linkContours(candidateEdges: Array<Edge>): void {
  candidateEdges.sort((a, b) => a.score - b.score);

  for (const { cinfoA, cinfoB } of candidateEdges) {
    if (!cinfoA.succ && !cinfoB.pred) {
      cinfoA.succ = cinfoB;
      cinfoB.pred = cinfoA;
    }
  }
}

function extractSpans(
  cinfoList: Array<ContourInfo>,
  stats: SpanStats
): Array<Array<ContourInfo>> {
  const spans: Array<Array<ContourInfo>> = [];
  const listCopy = [...cinfoList];

  while (listCopy.length > 0) {
    let cinfo = listCopy[0];
    while (cinfo.pred) cinfo = cinfo.pred;

    const curSpan: Array<ContourInfo> = [];
    let width = 0.0;

    while (cinfo) {
      const idx = listCopy.indexOf(cinfo);
      if (idx > -1) listCopy.splice(idx, 1);

      curSpan.push(cinfo);
      width += cinfo.local_xrng[1] - cinfo.local_xrng[0];
      cinfo = cinfo.succ;
    }

    if (width > Config.SPAN_MIN_WIDTH) {
      spans.push(curSpan);
      stats.spanWidths.push(width);
      stats.spanSizes.push(curSpan.length);
    }
  }

  return spans;
}

/**
 * Groups contours into horizontal text lines using proximity/alignment scoring.
 */
export function assembleSpans(
  cinfoList: Array<ContourInfo>
): { spans: Array<Array<ContourInfo>>; stats: SpanStats } {
  sortContoursForAssembly(cinfoList);

  const stats: SpanStats = {
    candidatePairs: 0,
    validEdges: 0,
    rejectionBreakdown: {
      distance: 0,
      overlap: 0,
      angle: 0,
    },
    linkedContours: 0,
    spanSizes: [],
    spanWidths: [],
  };

  const candidateEdges = generateAllCandidateEdges(cinfoList, stats);
  linkContours(candidateEdges);

  stats.linkedContours = cinfoList.filter((c) => c.succ || c.pred).length;

  const spans = extractSpans(cinfoList, stats);

  return { spans, stats };
}

function computeColumnMeans(
  mask: { data: Uint8Array; cols: number; rows: number },
  width: number,
  height: number
): Array<number> {
  const maskData = mask.data;
  const stride = mask.cols;

  const colSums = new Int32Array(width).fill(0);
  const colWeightedSums = new Int32Array(width).fill(0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const val = maskData[y * stride + x];
      if (val > 0) {
        colSums[x] += val;
        colWeightedSums[x] += y * val;
      }
    }
  }

  const means: Array<number> = [];
  for (let x = 0; x < width; x++) {
    means.push(colWeightedSums[x] / colSums[x]);
  }

  return means;
}

function sampleContourPoints(
  cinfo: ContourInfo,
  step: number
): Array<[number, number]> {
  const { width, height } = cinfo.rect;
  const means = computeColumnMeans(cinfo.mask, width, height);

  const start = Math.floor(((means.length - 1) % step) / 2);
  const { x: xmin, y: ymin } = cinfo.rect;

  const points: Array<[number, number]> = [];
  for (let x = start; x < means.length; x += step) {
    points.push([x + xmin, means[x] + ymin]);
  }

  return points;
}

import type { CVMat } from "../../types/opencv";

/**
 * Extracts evenly-spaced sample points along each span's center line.
 */
export function sampleSpans(
  shape: CVMat | { rows: number; cols: number } | [number, number],
  spans: Array<Array<ContourInfo>>
): Array<Array<[number, number]>> {
  const spanPoints: Array<Array<[number, number]>> = [];
  const step = Config.SPAN_PX_PER_STEP;

  for (const span of spans) {
    const contourPoints: Array<[number, number]> = [];
    for (const cinfo of span) {
      const points = sampleContourPoints(cinfo, step);
      contourPoints.push(...points);
    }

    if (contourPoints.length > 0) {
      spanPoints.push(pix2norm(shape, contourPoints));
    }
  }
  return spanPoints;
}

function getPrincipalAxis(points: Array<[number, number]>): [number, number] {
  if (points.length < 2) return [1, 0];

  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p[0];
    sumY += p[1];
  }
  const meanX = sumX / points.length;
  const meanY = sumY / points.length;

  let covXX = 0;
  let covXY = 0;
  let covYY = 0;
  for (const p of points) {
    const dx = p[0] - meanX;
    const dy = p[1] - meanY;
    covXX += dx * dx;
    covXY += dx * dy;
    covYY += dy * dy;
  }

  const T = covXX + covYY;
  const D = covXX * covYY - covXY * covXY;
  const L1 = T / 2 + Math.sqrt(Math.max(0, (T * T) / 4 - D));

  let vx: number;
  let vy: number;
  if (Math.abs(covXY) > 1e-9) {
    const diff = covXX - L1;
    const theta = Math.atan2(-diff, covXY);
    vx = Math.cos(theta);
    vy = Math.sin(theta);
  } else if (covXX >= covYY) {
    vx = 1;
    vy = 0;
  } else {
    vx = 0;
    vy = 1;
  }

  if (vx < 0) {
    vx = -vx;
    vy = -vy;
  }

  return [vx, vy];
}

function computeGlobalPageAxes(spanPoints: Array<Array<[number, number]>>): {
  x_dir: [number, number];
  y_dir: [number, number];
  spanAxes: Array<[number, number]>;
  spanWeights: Array<number>;
  allEvecX: number;
  allEvecY: number;
  allWeights: number;
} {
  let allEvecX = 0;
  let allEvecY = 0;
  let allWeights = 0;

  const spanAxes: Array<[number, number]> = [];
  const spanWeights: Array<number> = [];

  for (const points of spanPoints) {
    if (points.length < 2) continue;

    const [vx, vy] = getPrincipalAxis(points);
    spanAxes.push([vx, vy]);
    const pFirst = points[0];
    const pLast = points[points.length - 1];

    const weight = Math.sqrt(
      Math.pow(pLast[0] - pFirst[0], 2) + Math.pow(pLast[1] - pFirst[1], 2)
    );
    spanWeights.push(weight);

    allEvecX += vx * weight;
    allEvecY += vy * weight;
    allWeights += weight;
  }

  if (allWeights === 0) {
    allEvecX = 1;
    allEvecY = 0;
    allWeights = 1;
  }

  const averageAxisX = allEvecX / allWeights;
  const averageAxisY = allEvecY / allWeights;

  let x_dir: [number, number] = [averageAxisX, averageAxisY];
  if (x_dir[0] < 0) x_dir = [-x_dir[0], -x_dir[1]];
  const y_dir: [number, number] = [-x_dir[1], x_dir[0]];

  return {
    x_dir,
    y_dir,
    spanAxes,
    spanWeights,
    allEvecX,
    allEvecY,
    allWeights,
  };
}

function computePageCorners(
  pageCoordsNorm: Array<[number, number]>,
  x_dir: [number, number],
  y_dir: [number, number]
): { corners: Array<[number, number]>; pageXMin: number; pageYMin: number } {
  const projectedXCoords = pageCoordsNorm.map(
    (p) => p[0] * x_dir[0] + p[1] * x_dir[1]
  );
  const projectedYCoords = pageCoordsNorm.map(
    (p) => p[0] * y_dir[0] + p[1] * y_dir[1]
  );

  const pageXMin = Math.min(...projectedXCoords);
  const pageXMax = Math.max(...projectedXCoords);
  const pageYMin = Math.min(...projectedYCoords);
  const pageYMax = Math.max(...projectedYCoords);

  function getCorner(cx: number, cy: number): [number, number] {
    return [cx * x_dir[0] + cy * y_dir[0], cx * x_dir[1] + cy * y_dir[1]];
  }

  const corners: Array<[number, number]> = [
    getCorner(pageXMin, pageYMin),
    getCorner(pageXMax, pageYMin),
    getCorner(pageXMax, pageYMax),
    getCorner(pageXMin, pageYMax),
  ];

  return { corners, pageXMin, pageYMin };
}

function computeSpanCoordinates(
  spanPoints: Array<Array<[number, number]>>,
  x_dir: [number, number],
  y_dir: [number, number],
  pageXMin: number,
  pageYMin: number
): { xcoords: Array<Array<number>>; ycoords: Array<number> } {
  const xcoords: Array<Array<number>> = [];
  const ycoords: Array<number> = [];

  for (const points of spanPoints) {
    const px = points.map((p) => p[0] * x_dir[0] + p[1] * x_dir[1]);
    const py = points.map((p) => p[0] * y_dir[0] + p[1] * y_dir[1]);

    xcoords.push(px.map((v) => v - pageXMin));

    const meanY = py.reduce((a, b) => a + b, 0) / py.length;
    ycoords.push(meanY - pageYMin);
  }

  return { xcoords, ycoords };
}

/**
 * Computes page corners and normalized coordinates for optimization.
 */
export function keypointsFromSamples(
  pagemask: CVMat | { rows: number; cols: number } | [number, number],
  page_outline: Array<[number, number]>,
  spanPoints: Array<Array<[number, number]>>
): {
  corners: Array<[number, number]>;
  ycoords: Array<number>;
  xcoords: Array<Array<number>>;
} {
  const { x_dir, y_dir } = computeGlobalPageAxes(spanPoints);

  const pageCoordsNorm = pix2norm(pagemask, page_outline);
  const { corners, pageXMin, pageYMin } = computePageCorners(
    pageCoordsNorm,
    x_dir,
    y_dir
  );
  const { xcoords, ycoords } = computeSpanCoordinates(
    spanPoints,
    x_dir,
    y_dir,
    pageXMin,
    pageYMin
  );

  return { corners, ycoords, xcoords };
}

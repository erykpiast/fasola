import type { CV } from "../../types/opencv";
import { Config } from "./config";
import { solvePnP } from "./solvepnp/index";

/**
 * Computes initial camera pose and builds the parameter vector for optimization.
 */
export function getDefaultParams(
  cv: CV,
  corners: Array<[number, number]>,
  ycoords: Array<number>,
  xcoords: Array<Array<number>>
): {
  pageDims: [number, number];
  spanCounts: Array<number>;
  params: Array<number>;
} {
  function dist(p1: [number, number], p2: [number, number]): number {
    return Math.sqrt(Math.pow(p1[0] - p2[0], 2) + Math.pow(p1[1] - p2[1], 2));
  }

  const pageWidth = dist(corners[0], corners[1]);
  const pageHeight = dist(corners[0], corners[3]);

  const objectPoints: Array<[number, number, number]> = [
    [0, 0, 0],
    [pageWidth, 0, 0],
    [pageWidth, pageHeight, 0],
    [0, pageHeight, 0],
  ];

  const imagePoints = corners;

  const f = Config.FOCAL_LENGTH;
  const cameraMatrix = [f, 0, 0, 0, f, 0, 0, 0, 1];
  const distCoeffs: Array<number> = [];

  if (Config.DEBUG_LEVEL >= 1) {
    console.log(`  Running solvePnP on ${objectPoints.length} points...`);
  }

  const solution = solvePnP(
    cv,
    objectPoints,
    imagePoints,
    cameraMatrix,
    distCoeffs
  );

  if (Config.DEBUG_LEVEL >= 1) {
    console.log(`  solvePnP success: ${solution.success}`);
    console.log(`  rvec: ${solution.rvec}`);
    console.log(`  tvec: ${solution.tvec}`);
  }

  const refinedParams = [...solution.rvec, ...solution.tvec];

  const spanCounts = xcoords.map((xc) => xc.length);

  const params: Array<number> = [];

  params.push(refinedParams[0], refinedParams[1], refinedParams[2]);
  params.push(refinedParams[3], refinedParams[4], refinedParams[5]);
  params.push(0.0, 0.0);
  ycoords.forEach((y) => params.push(y));
  xcoords.forEach((xc) => xc.forEach((x) => params.push(x)));

  return {
    pageDims: [pageWidth, pageHeight],
    spanCounts,
    params,
  };
}

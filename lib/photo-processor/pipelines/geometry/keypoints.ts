import type { CV } from "../../types/opencv";
import { projectXY } from "./projection";

/**
 * Builds an index mapping each keypoint to its position in the parameter vector.
 */
export function makeKeypointIndex(spanCounts: Array<number>): Array<[number, number]> {
  const nSpans = spanCounts.length;
  const nPts = spanCounts.reduce((a, b) => a + b, 0);

  const keypointIndex: Array<[number, number]> = [];
  for (let i = 0; i <= nPts; i++) keypointIndex.push([0, 0]);

  let start = 1;
  for (let i = 0; i < nSpans; i++) {
    const count = spanCounts[i];
    const end = start + count;
    for (let k = start; k < end; k++) {
      keypointIndex[k][1] = 8 + i;
    }
    start = end;
  }

  for (let i = 1; i <= nPts; i++) {
    keypointIndex[i][0] = i - 1 + 8 + nSpans;
  }

  return keypointIndex;
}

/**
 * Projects all keypoints using the current parameters.
 */
export function projectKeypoints(
  cv: CV,
  pvec: Array<number>,
  keypointIndex: Array<[number, number]>
): Array<[number, number]> {
  const xyCoords: Array<[number, number]> = [];

  xyCoords.push([0, 0]);

  for (let i = 1; i < keypointIndex.length; i++) {
    const idxX = keypointIndex[i][0];
    const idxY = keypointIndex[i][1];
    const x = pvec[idxX];
    const y = pvec[idxY];
    xyCoords.push([x, y]);
  }

  return projectXY(cv, xyCoords, pvec);
}


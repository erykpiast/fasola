import { solveDLT } from "./dlt";
import { refinePose } from "./optimizer";

interface CV {
  Mat: new () => unknown;
}

/**
 * Finds an object pose from 3D-2D point correspondences.
 * Mirrors OpenCV's solvePnP.
 */
export function solvePnP(
  cv: CV,
  objectPoints: Array<[number, number, number]>,
  imagePoints: Array<[number, number]>,
  cameraMatrix: Array<number>,
  distCoeffs: Array<number> = []
): { rvec: Array<number>; tvec: Array<number>; success: boolean } {
  if (objectPoints.length !== imagePoints.length) {
    throw new Error("solvePnP: objectPoints and imagePoints must have same length");
  }

  const initPose = solveDLT(cv as any, objectPoints, imagePoints, cameraMatrix);

  const refined = refinePose(
    initPose.rvec,
    initPose.tvec,
    objectPoints,
    imagePoints,
    cameraMatrix,
    distCoeffs
  );

  return {
    rvec: refined.rvec,
    tvec: refined.tvec,
    success: true,
  };
}


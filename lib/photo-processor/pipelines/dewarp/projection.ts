import { Config } from "./config";

interface Mat {
  delete(): void;
  doubleAt(row: number, col: number): number;
}

interface CV {
  Mat: new () => Mat;
  matFromArray(rows: number, cols: number, type: number, data: Array<number>): Mat;
  Rodrigues(src: Mat, dst: Mat): void;
  CV_64F: number;
}

/**
 * Returns the 3x3 camera intrinsic matrix.
 */
export function getK(cv: CV): Mat {
  const f_val = Config.FOCAL_LENGTH;
  const data = [f_val, 0, 0, 0, f_val, 0, 0, 0, 1];
  return cv.matFromArray(3, 3, cv.CV_64F, data);
}

/**
 * Projects 2D page coordinates to 2D image coordinates using the cubic surface
 * model and camera pose.
 */
export function projectXY(
  cv: CV,
  xyCoords: Array<[number, number]>,
  pvec: Array<number>
): Array<[number, number]> {
  const rvecIdx = Config.RVEC_IDX;
  const tvecIdx = Config.TVEC_IDX;
  const cubicIdx = Config.CUBIC_IDX;

  let a = pvec[cubicIdx[0]];
  let b = pvec[cubicIdx[0] + 1];

  a = Math.max(-0.5, Math.min(0.5, a));
  b = Math.max(-0.5, Math.min(0.5, b));

  const p0 = a + b;
  const p1 = -2 * a - b;
  const p2 = a;

  const objPoints: Array<[number, number, number]> = [];
  for (const pt of xyCoords) {
    const x = pt[0];
    const y = pt[1];
    const x2 = x * x;
    const x3 = x2 * x;
    const z = p0 * x3 + p1 * x2 + p2 * x;
    objPoints.push([x, y, z]);
  }

  const rvecData = pvec.slice(rvecIdx[0], rvecIdx[1]);
  const tvecData = pvec.slice(tvecIdx[0], tvecIdx[1]);

  const rvecMat = cv.matFromArray(3, 1, cv.CV_64F, rvecData);
  const R = new cv.Mat();
  cv.Rodrigues(rvecMat, R);

  const t = tvecData;

  const K_f = Config.FOCAL_LENGTH;

  const result: Array<[number, number]> = [];

  const r00 = R.doubleAt(0, 0);
  const r01 = R.doubleAt(0, 1);
  const r02 = R.doubleAt(0, 2);
  const r10 = R.doubleAt(1, 0);
  const r11 = R.doubleAt(1, 1);
  const r12 = R.doubleAt(1, 2);
  const r20 = R.doubleAt(2, 0);
  const r21 = R.doubleAt(2, 1);
  const r22 = R.doubleAt(2, 2);

  const tx = t[0];
  const ty = t[1];
  const tz = t[2];

  for (const p of objPoints) {
    const X = p[0];
    const Y = p[1];
    const Z = p[2];

    const Pcx = r00 * X + r01 * Y + r02 * Z + tx;
    const Pcy = r10 * X + r11 * Y + r12 * Z + ty;
    const Pcz = r20 * X + r21 * Y + r22 * Z + tz;

    const x_p = Pcx / Pcz;
    const y_p = Pcy / Pcz;

    const u = K_f * x_p;
    const v = K_f * y_p;

    result.push([u, v]);
  }

  rvecMat.delete();
  R.delete();

  return result;
}


import type { CV, CVMat } from "../../../types/opencv";

/**
 * Estimates initial pose (R, t) from 3D-2D correspondences.
 * Handles Planar (Z=0) and Non-Planar cases.
 */
export function solveDLT(
  cv: CV,
  objectPoints: Array<[number, number, number]>,
  imagePoints: Array<[number, number]>,
  cameraMatrix: Array<number>
): { rvec: Array<number>; tvec: Array<number> } {
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of objectPoints) {
    if (p[2] < minZ) minZ = p[2];
    if (p[2] > maxZ) maxZ = p[2];
  }
  const isPlanar = Math.abs(maxZ - minZ) < 1e-6;

  if (isPlanar) {
    return solvePlanar(cv, objectPoints, imagePoints, cameraMatrix);
  } else {
    return solveGenericDLT(cv, objectPoints, imagePoints, cameraMatrix);
  }
}

function computeHomography(
  cv: CV,
  objectPoints: Array<[number, number, number]>,
  imagePoints: Array<[number, number]>
): CVMat {
  const srcData: Array<number> = [];
  const dstData: Array<number> = [];
  for (let i = 0; i < objectPoints.length; i++) {
    srcData.push(objectPoints[i][0], objectPoints[i][1]);
    dstData.push(imagePoints[i][0], imagePoints[i][1]);
  }

  const srcMat = cv.matFromArray(objectPoints.length, 1, cv.CV_32FC2, srcData);
  const dstMat = cv.matFromArray(imagePoints.length, 1, cv.CV_32FC2, dstData);

  const H = cv.findHomography(srcMat, dstMat);

  srcMat.delete();
  dstMat.delete();

  return H;
}

function decomposeHomographyToPose(
  cv: CV,
  H: CVMat,
  K: Array<number>
): { rvec: Array<number>; tvec: Array<number> } {
  const fx = K[0];
  const cx = K[2];
  const fy = K[4];
  const cy = K[5];

  const h00 = H.doubleAt(0, 0);
  const h01 = H.doubleAt(0, 1);
  const h02 = H.doubleAt(0, 2);
  const h10 = H.doubleAt(1, 0);
  const h11 = H.doubleAt(1, 1);
  const h12 = H.doubleAt(1, 2);
  const h20 = H.doubleAt(2, 0);
  const h21 = H.doubleAt(2, 1);
  const h22 = H.doubleAt(2, 2);

  let r1x = (h00 - cx * h20) / fx;
  let r1y = (h10 - cy * h20) / fy;
  let r1z = h20;

  let r2x = (h01 - cx * h21) / fx;
  let r2y = (h11 - cy * h21) / fy;
  let r2z = h21;

  let tx = (h02 - cx * h22) / fx;
  let ty = (h12 - cy * h22) / fy;
  let tz = h22;

  const n1 = Math.sqrt(r1x * r1x + r1y * r1y + r1z * r1z);
  r1x /= n1;
  r1y /= n1;
  r1z /= n1;

  const n2 = Math.sqrt(r2x * r2x + r2y * r2y + r2z * r2z);
  r2x /= n2;
  r2y /= n2;
  r2z /= n2;

  const scale = (n1 + n2) / 2;
  tx /= scale;
  ty /= scale;
  tz /= scale;

  const r3x = r1y * r2z - r1z * r2y;
  const r3y = r1z * r2x - r1x * r2z;
  const r3z = r1x * r2y - r1y * r2x;

  const A_js: Array<Array<number>> = [
    [r1x, r2x, r3x],
    [r1y, r2y, r3y],
    [r1z, r2z, r3z],
  ];

  const { u: U_js, vt: Vt_js } = svd3x3(A_js);

  const R_ortho_js: Array<Array<number>> = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) sum += U_js[i][k] * Vt_js[k][j];
      R_ortho_js[i][j] = sum;
    }
  }

  const R_ortho_flat = R_ortho_js.flat();
  const R_ortho = cv.matFromArray(3, 3, cv.CV_64F, R_ortho_flat);

  const rvecMat = new cv.Mat();
  cv.Rodrigues(R_ortho, rvecMat);

  const rvec = [
    rvecMat.doubleAt(0, 0),
    rvecMat.doubleAt(1, 0),
    rvecMat.doubleAt(2, 0),
  ];
  const tvec = [tx, ty, tz];

  R_ortho.delete();
  rvecMat.delete();

  return { rvec, tvec };
}

function solvePlanar(
  cv: CV,
  objectPoints: Array<[number, number, number]>,
  imagePoints: Array<[number, number]>,
  K: Array<number>
): { rvec: Array<number>; tvec: Array<number> } {
  const H = computeHomography(cv, objectPoints, imagePoints);
  const { rvec, tvec } = decomposeHomographyToPose(cv, H, K);
  H.delete();
  return { rvec, tvec };
}

function solveGenericDLT(
  _cv: CV,
  _objectPoints: Array<[number, number, number]>,
  _imagePoints: Array<[number, number]>,
  _K: Array<number>
): { rvec: Array<number>; tvec: Array<number> } {
  throw new Error("Non-planar DLT not implemented - input points must have Z=0");
}

/**
 * Computes SVD of a 3x3 matrix using Jacobi eigenvalue algorithm.
 * Returns U, Σ (as w), and V^T such that A = U Σ V^T.
 */
function svd3x3(A: Array<Array<number>>): {
  u: Array<Array<number>>;
  w: Array<number>;
  vt: Array<Array<number>>;
} {
  const B: Array<Array<number>> = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        sum += A[k][i] * A[k][j];
      }
      B[i][j] = sum;
    }
  }

  let V: Array<Array<number>> = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  let d = [B[0][0], B[1][1], B[2][2]];
  let bw = [...d];
  let z = [0, 0, 0];

  const n = 3;
  for (let i = 0; i < 50; i++) {
    let sm = 0;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        sm += Math.abs(B[p][q]);
      }
    }
    if (sm === 0) break;

    const tresh = i < 4 ? (0.2 * sm) / (n * n) : 0;

    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const g = 100 * Math.abs(B[p][q]);
        if (
          i > 4 &&
          Math.abs(d[p]) + g === Math.abs(d[p]) &&
          Math.abs(d[q]) + g === Math.abs(d[q])
        ) {
          B[p][q] = 0;
        } else if (Math.abs(B[p][q]) > tresh) {
          let h = d[q] - d[p];
          let t: number;
          if (Math.abs(h) + g === Math.abs(h)) {
            t = B[p][q] / h;
          } else {
            const theta = (0.5 * h) / B[p][q];
            t = 1 / (Math.abs(theta) + Math.sqrt(1 + theta * theta));
            if (theta < 0) t = -t;
          }

          const c = 1 / Math.sqrt(1 + t * t);
          const s = t * c;
          const tau = s / (1 + c);
          h = t * B[p][q];
          z[p] -= h;
          z[q] += h;
          d[p] -= h;
          d[q] += h;
          B[p][q] = 0;

          for (let j = 0; j < p; j++) {
            const g = B[j][p];
            const h_ = B[j][q];
            B[j][p] = g - s * (h_ + g * tau);
            B[j][q] = h_ + s * (g - h_ * tau);
          }
          for (let j = p + 1; j < q; j++) {
            const g = B[p][j];
            const h_ = B[j][q];
            B[p][j] = g - s * (h_ + g * tau);
            B[j][q] = h_ + s * (g - h_ * tau);
          }
          for (let j = q + 1; j < n; j++) {
            const g = B[p][j];
            const h_ = B[q][j];
            B[p][j] = g - s * (h_ + g * tau);
            B[q][j] = h_ + s * (g - h_ * tau);
          }

          for (let j = 0; j < n; j++) {
            const g = V[j][p];
            const h_ = V[j][q];
            V[j][p] = g - s * (h_ + g * tau);
            V[j][q] = h_ + s * (g - h_ * tau);
          }
        }
      }
    }
    for (let p = 0; p < n; p++) {
      d[p] = bw[p] + z[p];
      z[p] = 0;
      bw[p] = d[p];
    }
  }

  const w = d.map((v) => Math.sqrt(Math.max(0, v)));

  const U: Array<Array<number>> = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      let val = 0;
      for (let k = 0; k < 3; k++) {
        val += A[r][k] * V[k][c];
      }
      if (w[c] > 1e-6) val /= w[c];
      else val = 0;
      U[r][c] = val;
    }
  }

  const Vt: Array<Array<number>> = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      Vt[r][c] = V[c][r];
    }
  }

  return { w, u: U, vt: Vt };
}


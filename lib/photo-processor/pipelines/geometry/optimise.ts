import { Config } from "./config";
import { makeKeypointIndex, projectKeypoints } from "./keypoints";

interface CV {
  Mat: new () => unknown;
}

function bracketMinimum(
  f: (x: number) => number,
  x0: number,
  s = 0.1
): { a: number; b: number; c: number } {
  let a = x0;
  let b = x0 + s;
  let fa = f(a);
  let fb = f(b);

  if (fb > fa) {
    s = -s;
    b = x0 + s;
    fb = f(b);
    if (fb > fa) {
      return { a: x0 - Math.abs(s), b: x0, c: x0 + Math.abs(s) };
    }
  }

  let c = b + s;
  let fc = f(c);

  let iter = 0;
  while (fc < fb && iter < 50) {
    a = b;
    fa = fb;
    b = c;
    fb = fc;
    s *= 1.618;
    c = b + s;
    fc = f(c);
    iter++;
  }

  if (a > c) {
    const tmp = a;
    a = c;
    c = tmp;
  }
  return { a, b, c };
}

function brentSearch(
  f: (x: number) => number,
  a: number,
  b: number,
  c: number,
  tol: number
): number {
  const CGOLD = 0.381966;
  const ZEPS = 1e-10;
  const ITMAX = 100;

  let x = b;
  let w = b;
  let v = b;
  let fx = f(x);
  let fw = fx;
  let fv = fx;
  let e = 0.0;
  let d = 0.0;

  for (let iter = 0; iter < ITMAX; iter++) {
    const xm = 0.5 * (a + c);
    const tol1 = tol * Math.abs(x) + ZEPS;
    const tol2 = 2.0 * tol1;

    if (Math.abs(x - xm) <= tol2 - 0.5 * (c - a)) {
      return x;
    }

    let u: number;
    if (Math.abs(e) > tol1) {
      const r = (x - w) * (fx - fv);
      let q = (x - v) * (fx - fw);
      let p = (x - v) * q - (x - w) * r;
      q = 2.0 * (q - r);
      if (q > 0.0) p = -p;
      q = Math.abs(q);
      const etemp = e;
      e = d;

      if (
        Math.abs(p) >= Math.abs(0.5 * q * etemp) ||
        p <= q * (a - x) ||
        p >= q * (c - x)
      ) {
        e = x >= xm ? a - x : c - x;
        d = CGOLD * e;
      } else {
        d = p / q;
        u = x + d;
        if (u - a < tol2 || c - u < tol2) {
          d = xm - x >= 0 ? tol1 : -tol1;
        }
      }
    } else {
      e = x >= xm ? a - x : c - x;
      d = CGOLD * e;
    }

    u = Math.abs(d) >= tol1 ? x + d : x + (d >= 0 ? tol1 : -tol1);
    const fu = f(u);

    if (fu <= fx) {
      if (u >= x) {
        a = x;
      } else {
        c = x;
      }
      v = w;
      w = x;
      x = u;
      fv = fw;
      fw = fx;
      fx = fu;
    } else {
      if (u < x) {
        a = u;
      } else {
        c = u;
      }
      if (fu <= fw || w === x) {
        v = w;
        w = u;
        fv = fw;
        fw = fu;
      } else if (fu <= fv || v === x || v === w) {
        v = u;
        fv = fu;
      }
    }
  }

  return x;
}

function optimize1D(f: (x: number) => number, x0: number, tol: number): number {
  const { a, b, c } = bracketMinimum(f, x0);
  return brentSearch(f, a, b, c, tol);
}

function lineSearchAlongDirection(
  x: Float64Array,
  direction: Float64Array,
  objective: (x: Float64Array) => number,
  tol: number,
  scratch: Float64Array
): { alpha: number; fx: number } {
  let maxComponent = 0;
  for (let i = 0; i < direction.length; i++) {
    maxComponent = Math.max(maxComponent, Math.abs(direction[i]));
  }
  if (maxComponent < 1e-12) {
    return { alpha: 0, fx: objective(x) };
  }

  const phi = (alpha: number): number => {
    for (let i = 0; i < x.length; i++) {
      scratch[i] = x[i] + alpha * direction[i];
    }
    return objective(scratch);
  };

  const alpha = optimize1D(phi, 0, tol);
  for (let i = 0; i < x.length; i++) {
    x[i] = x[i] + alpha * direction[i];
  }
  const fx = objective(x);
  return { alpha, fx };
}

function initializeDirections(n: number): Array<Float64Array> {
  const directions: Array<Float64Array> = [];
  for (let i = 0; i < n; i++) {
    const dir = new Float64Array(n);
    dir[i] = 1;
    directions.push(dir);
  }
  return directions;
}

function powellIteration(
  x: Float64Array,
  directions: Array<Float64Array>,
  objective: (x: Float64Array) => number,
  tol: number,
  scratch: Float64Array,
  xOld: Float64Array,
  pt: Float64Array,
  delta: Float64Array
): { fx: number; converged: boolean } {
  const n = x.length;
  xOld.set(x);
  const fxOld = objective(x);
  let fx = fxOld;
  let biggestDecrease = 0;
  let biggestIdx = -1;

  for (let i = 0; i < n; i++) {
    const dir = directions[i];
    const fBefore = fx;
    const { alpha, fx: fxAfter } = lineSearchAlongDirection(
      x,
      dir,
      objective,
      tol,
      scratch
    );
    if (alpha !== 0) {
      const decrease = fBefore - fxAfter;
      if (decrease > biggestDecrease) {
        biggestDecrease = decrease;
        biggestIdx = i;
      }
      fx = fxAfter;
    }
  }

  let converged = Math.abs(fxOld - fx) < tol;

  for (let i = 0; i < n; i++) {
    delta[i] = x[i] - xOld[i];
    pt[i] = x[i] + delta[i];
  }

  const fpt = objective(pt);
  if (
    fpt < fx &&
    biggestIdx !== -1 &&
    2 * (fxOld - 2 * fx + fpt) * Math.pow(fxOld - fx - biggestDecrease, 2) <
      biggestDecrease * Math.pow(fxOld - fpt, 2)
  ) {
    const { alpha, fx: fxAfter } = lineSearchAlongDirection(
      x,
      delta,
      objective,
      tol,
      scratch
    );
    if (alpha !== 0) {
      fx = fxAfter;
      directions[biggestIdx] = Float64Array.from(delta);
      converged = false;
    }
  }

  return { fx, converged };
}

/**
 * Implements Powell's method (derivative-free optimization using sequential 1D line searches).
 */
export function minimize(
  objective: (x: Float64Array) => number,
  initialParams: Array<number>,
  options: { maxIter?: number; tol?: number; log?: boolean } = {}
): { x: Array<number>; fx: number } {
  const maxIter = options.maxIter ?? Config.OPTIM_MAX_ITER;
  const tol = options.tol ?? Config.OPTIM_TOL;
  const log = options.log ?? false;

  const x = Float64Array.from(initialParams);
  const n = x.length;
  let fx = objective(x);

  const directions = initializeDirections(n);
  const scratch = new Float64Array(n);
  const xOld = new Float64Array(n);
  const pt = new Float64Array(n);
  const delta = new Float64Array(n);

  for (let iter = 1; iter <= maxIter; iter++) {
    const { fx: fxNew, converged } = powellIteration(
      x,
      directions,
      objective,
      tol,
      scratch,
      xOld,
      pt,
      delta
    );
    fx = fxNew;

    if (log) {
      console.log(`  iter ${iter}: loss ${fx.toFixed(4)}`);
    }

    if (converged) {
      break;
    }
  }

  return { x: Array.from(x), fx };
}

/**
 * Refines the page model to minimize reprojection error.
 */
export async function optimiseParams(
  cv: CV,
  name: string,
  small: unknown,
  dstpoints: Array<[number, number]>,
  spanCounts: Array<number>,
  params: Array<number>
): Promise<Array<number>> {
  const keypointIndex = makeKeypointIndex(spanCounts);

  function objective(p: Float64Array): number {
    const ppts = projectKeypoints(cv, Array.from(p), keypointIndex);
    let sumSq = 0;
    for (let i = 0; i < dstpoints.length; i++) {
      const dx = dstpoints[i][0] - ppts[i][0];
      const dy = dstpoints[i][1] - ppts[i][1];
      sumSq += dx * dx + dy * dy;
    }
    return sumSq;
  }

  const initialLoss = objective(Float64Array.from(params));
  console.log(`  initial objective is ${initialLoss}`);

  console.log(
    `  optimizing ${params.length} parameters using Powell's method...`
  );

  const start = Date.now();
  const solution = minimize(objective, params, {
    log: true,
    maxIter: Config.OPTIM_MAX_ITER,
    tol: Config.OPTIM_TOL,
  });
  const end = Date.now();

  const optimizationTime = (end - start) / 1000;
  console.log(`  optimization took ${optimizationTime} sec.`);
  console.log(`  final objective is ${solution.fx}`);

  return solution.x;
}

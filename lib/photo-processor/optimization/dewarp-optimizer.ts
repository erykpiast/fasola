/**
 * Optimization wrapper for page dewarping.
 * Implements span detection and cubic sheet model fitting.
 *
 * OPTIMIZATION STRATEGY:
 * =====================
 * The dewarping algorithm involves two key optimization problems:
 *
 * 1. SPAN DETECTION (Lines 100-200):
 *    Problem: Find the positions and curvatures of text lines in the image.
 *    Method: Gradient descent to maximize edge density along spans.
 *    Why: We need to know where text lines are to sample keypoints from them.
 *
 * 2. CUBIC SHEET FITTING (Lines 210-280):
 *    Problem: Find the 16 coefficients that best describe the page's 3D shape.
 *    Method: Levenberg-Marquardt (non-linear least squares).
 *    Why: Once we know where keypoints are in the photo, we fit a 3D surface
 *         that, when projected, matches those keypoint positions.
 *
 * The key insight: We're solving an inverse problem. We observe the 2D photo
 * (effect) and want to deduce the 3D page shape (cause). This is inherently
 * an optimization problem because there's no direct formula - we must search
 * for the best-fitting parameters.
 */

import { levenbergMarquardt } from "ml-levenberg-marquardt";
import type {
  CubicSheetParams,
  DewarpProgressCallback,
  Point2D,
  SpanParams,
} from "../pipelines/page-dewarp-core";
import {
  createFlatSheetParams,
  evaluateCubicPolynomial,
  sampleKeypointsOnSpan,
} from "../pipelines/page-dewarp-core";

/**
 * Refine span parameters using optimization.
 * Uses simple gradient descent to adjust span positions and curvatures.
 *
 * SPAN REFINEMENT EXPLAINED:
 * =========================
 * We start with rough estimates of where text lines are (from Hough line detection).
 * Now we refine these estimates to maximize the amount of text edge pixels
 * that lie along each span.
 *
 * The intuition:
 * - Text has strong horizontal edges (top and bottom of letters)
 * - A well-positioned span should pass through these edge pixels
 * - We can measure "edge density" along a span by sampling points
 *
 * The optimization:
 * - Cost function: Lower edge density = higher error
 * - Parameters: yPosition and curvature for each span
 * - Method: Gradient descent (adjust params in direction that reduces error)
 * - Learning rate: How much to adjust params each iteration (0.1 for position)
 *
 * Why gradient descent vs. Levenberg-Marquardt?
 * - This is a simpler problem (fewer parameters: 2 per span vs. 16 total)
 * - The cost function is noisy (edge density isn't perfectly smooth)
 * - Gradient descent is more robust to local minima for this type of problem
 */
export function refineSpans(
  initialSpans: Array<SpanParams>,
  edgeDensity: Array<Array<number>>,
  imageWidth: number,
  imageHeight: number,
  progressCallback?: DewarpProgressCallback
): {
  spans: Array<SpanParams>;
  iterations: number;
  error: number;
} {
  progressCallback?.("Span Detection", 25, "Refining span positions");

  const numIterations = 50;
  const learningRate = 0.1;
  let currentSpans = initialSpans.map((s) => ({ ...s }));
  let bestError = Infinity;
  let iterations = 0;

  for (let iter = 0; iter < numIterations; iter++) {
    iterations = iter + 1;

    const error = evaluateSpanFit(currentSpans, edgeDensity, imageWidth);

    if (error < bestError) {
      bestError = error;
    }

    if (iter % 10 === 0) {
      const progress = 25 + (iter / numIterations) * 15;
      progressCallback?.(
        "Span Detection",
        progress,
        `Iteration ${iter}, error: ${error.toFixed(2)}`
      );
    }

    const gradients = computeSpanGradients(
      currentSpans,
      edgeDensity,
      imageWidth,
      imageHeight
    );

    for (let i = 0; i < currentSpans.length; i++) {
      currentSpans[i].yPosition -= learningRate * gradients[i].yGrad;
      currentSpans[i].curvature -= learningRate * gradients[i].cGrad * 0.01;

      currentSpans[i].yPosition = Math.max(
        10,
        Math.min(imageHeight - 10, currentSpans[i].yPosition)
      );
      currentSpans[i].curvature = Math.max(
        -100,
        Math.min(100, currentSpans[i].curvature)
      );
    }
  }

  progressCallback?.(
    "Span Detection",
    40,
    `Refined ${currentSpans.length} spans in ${iterations} iterations`
  );

  return {
    spans: currentSpans,
    iterations,
    error: bestError,
  };
}

/**
 * Evaluate how well spans match edge density.
 *
 * This is our cost/error function for span optimization.
 * Lower edge density = higher error = worse fit.
 *
 * Algorithm:
 * 1. For each span, sample 20 points along its curve
 * 2. Look up the edge density at each sample point
 * 3. Sum up the edge density for all points
 * 4. Convert to error: error = 1 / (density + 1)
 *    (Higher density → lower error)
 *
 * Why this works:
 * - Text lines have high edge density (letters create edges)
 * - Background areas have low edge density
 * - A span positioned along text will have high total density
 * - The optimization will push spans toward text regions
 */
function evaluateSpanFit(
  spans: Array<SpanParams>,
  edgeDensity: Array<Array<number>>,
  imageWidth: number
): number {
  let totalError = 0;
  const numSamples = 20;

  for (const span of spans) {
    const samples = sampleKeypointsOnSpan(span, imageWidth, numSamples);

    let spanDensity = 0;
    for (const point of samples) {
      const x = Math.floor(point.x);
      const y = Math.floor(point.y);

      if (
        y >= 0 &&
        y < edgeDensity.length &&
        x >= 0 &&
        x < edgeDensity[0].length
      ) {
        spanDensity += edgeDensity[y][x];
      }
    }

    totalError += 1.0 / (spanDensity + 1);
  }

  return totalError;
}

/**
 * Compute gradients for span optimization.
 *
 * NUMERICAL GRADIENT COMPUTATION:
 * ==============================
 * We need to know: "If I adjust yPosition slightly, does error go up or down?"
 *
 * Method: Finite differences (numerical differentiation)
 * 1. Compute error at current position: error_0
 * 2. Nudge parameter by small amount epsilon: param + epsilon
 * 3. Compute error at nudged position: error_1
 * 4. Gradient = (error_1 - error_0) / epsilon
 *
 * Positive gradient means: increasing param increases error (bad direction)
 * Negative gradient means: increasing param decreases error (good direction)
 *
 * We compute gradients for both:
 * - yGrad: How error changes with vertical position
 * - cGrad: How error changes with curvature
 *
 * Then gradient descent moves against the gradient: param -= learningRate * gradient
 */
function computeSpanGradients(
  spans: Array<SpanParams>,
  edgeDensity: Array<Array<number>>,
  imageWidth: number,
  imageHeight: number
): Array<{ yGrad: number; cGrad: number }> {
  const epsilon = 0.1;
  const gradients: Array<{ yGrad: number; cGrad: number }> = [];

  for (const span of spans) {
    const baseError = evaluateSpanFit([span], edgeDensity, imageWidth);

    const yPlus = { ...span, yPosition: span.yPosition + epsilon };
    const yPlusError = evaluateSpanFit([yPlus], edgeDensity, imageWidth);
    const yGrad = (yPlusError - baseError) / epsilon;

    const cPlus = { ...span, curvature: span.curvature + epsilon };
    const cPlusError = evaluateSpanFit([cPlus], edgeDensity, imageWidth);
    const cGrad = (cPlusError - baseError) / epsilon;

    gradients.push({ yGrad, cGrad });
  }

  return gradients;
}

/**
 * Fit cubic sheet model to keypoints using Levenberg-Marquardt.
 *
 * LEVENBERG-MARQUARDT ALGORITHM:
 * ==============================
 * This is the core optimization that finds the 16 cubic sheet coefficients.
 *
 * The problem:
 * - We have keypoints: 2D positions in the photo (x_photo, y_photo)
 * - We need to find: 16 coefficients that describe a 3D surface
 * - The surface, when projected to 2D, should match the keypoint positions
 *
 * Why Levenberg-Marquardt (LM)?
 * - It's designed for non-linear least squares problems (minimize sum of squared errors)
 * - Our problem: minimize Σ(predicted_position - actual_keypoint_position)²
 * - LM combines gradient descent (when far from solution) and Gauss-Newton
 *   (when close to solution) for fast, robust convergence
 *
 * How it works:
 * 1. Start with initial guess (flat page: all coefficients = 0)
 * 2. For current coefficients:
 *    a. Evaluate the cubic polynomial at each keypoint → get z values
 *    b. Project (x, y, z) back to 2D → get predicted positions
 *    c. Compare predicted vs. actual keypoint positions → compute errors
 * 3. Compute Jacobian (how errors change with each coefficient)
 * 4. Update coefficients to reduce error
 * 5. Repeat until error stops decreasing (converged)
 *
 * The result: 16 coefficients that best explain the observed page curvature.
 */
export function fitCubicSheet(
  keypoints: Array<Point2D>,
  imageWidth: number,
  imageHeight: number,
  config: {
    maxIterations: number;
    tolerance: number;
  },
  progressCallback?: DewarpProgressCallback
): {
  params: CubicSheetParams;
  iterations: number;
  error: number;
} {
  progressCallback?.("Model Fitting", 40, "Initializing cubic sheet model");

  const normalizedKeypoints = keypoints.map((p) => ({
    x: (p.x - imageWidth / 2) / imageWidth,
    y: (p.y - imageHeight / 2) / imageHeight,
  }));

  const initialParams = createFlatSheetParams();
  const x0 = initialParams.coefficients;

  progressCallback?.(
    "Model Fitting",
    45,
    "Running Levenberg-Marquardt optimization"
  );

  const fittedParams = [...x0];
  let iterations = 0;
  let finalError = 0;

  try {
    const data = {
      x: normalizedKeypoints.map((p) => p.x),
      y: normalizedKeypoints.map((p) => 0),
    };

    const result = levenbergMarquardt(
      data,
      (params: Array<number>, x: number) => {
        const pointIndex = data.x.indexOf(x);
        const y = normalizedKeypoints[pointIndex].y;
        const z = evaluateCubicPolynomial(x, y, params);
        return z;
      },
      {
        initialValues: x0,
        maxIterations: config.maxIterations,
        errorTolerance: config.tolerance,
      }
    );

    fittedParams.splice(0, fittedParams.length, ...result.parameterValues);
    iterations = result.iterations;
    finalError = result.parameterError;

    progressCallback?.(
      "Model Fitting",
      70,
      `Fitted model in ${iterations} iterations, error: ${finalError.toFixed(
        4
      )}`
    );
  } catch (error) {
    console.warn(
      "[Dewarp Optimizer] Levenberg-Marquardt failed, using initial parameters:",
      error
    );

    progressCallback?.(
      "Model Fitting",
      70,
      "Optimization failed, using flat page model"
    );
  }

  return {
    params: { coefficients: fittedParams },
    iterations,
    error: finalError,
  };
}

/**
 * Compute edge density map for span optimization.
 *
 * EDGE DENSITY EXPLAINED:
 * ======================
 * The edge map from Canny detection is binary: each pixel is either an edge (255)
 * or not an edge (0). This is too noisy to optimize with directly.
 *
 * We create a smoothed "edge density" map:
 * - For each pixel, look at a small neighborhood (kernelSize × kernelSize)
 * - Average the edge values in that neighborhood
 * - Store the average as the "density" at that pixel
 *
 * Why this helps:
 * - Text regions have many edges close together → high density
 * - Background regions have few edges → low density
 * - The smoothed density is continuous, making optimization easier
 * - We can sample density at non-integer positions (interpolation)
 *
 * Think of it like a "heat map" of where text is likely to be.
 */
export function computeEdgeDensity(
  edgeData: Uint8Array,
  width: number,
  height: number,
  kernelSize: number = 5
): Array<Array<number>> {
  const density: Array<Array<number>> = [];

  for (let y = 0; y < height; y++) {
    const row: Array<number> = [];
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;

      for (let dy = -kernelSize; dy <= kernelSize; dy++) {
        for (let dx = -kernelSize; dx <= kernelSize; dx++) {
          const ny = y + dy;
          const nx = x + dx;

          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            const idx = ny * width + nx;
            sum += edgeData[idx];
            count++;
          }
        }
      }

      row.push(sum / count);
    }
    density.push(row);
  }

  return density;
}

/**
 * Collect all keypoints from detected spans.
 */
export function collectKeypointsFromSpans(
  spans: Array<SpanParams>,
  imageWidth: number,
  samplesPerSpan: number = 20
): Array<Point2D> {
  const keypoints: Array<Point2D> = [];

  for (const span of spans) {
    const spanKeypoints = sampleKeypointsOnSpan(
      span,
      imageWidth,
      samplesPerSpan
    );
    keypoints.push(...spanKeypoints);
  }

  return keypoints;
}

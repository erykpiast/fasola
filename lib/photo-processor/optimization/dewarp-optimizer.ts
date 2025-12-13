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
} from "../pipelines/geometry/page-dewarp-core";
import {
  createFlatSheetParams,
  evaluateCubicPolynomial,
  project3DTo2D,
  sampleKeypointsOnSpan,
} from "../pipelines/geometry/page-dewarp-core";

/**
 * Refine span parameters using optimization.
 * Uses simple gradient descent to adjust span positions and curvatures.
 *
 * SPAN REFINEMENT EXPLAINED:
 * =========================
 * We start with rough estimates of where text lines are (from contour detection).
 * Now we refine these estimates to maximize the amount of text contour density
 * that lies along each span.
 *
 * The intuition:
 * - Text contours indicate where text regions are located
 * - A well-positioned span should pass through these text regions
 * - We can measure "contour density" along a span by sampling points
 *
 * The optimization:
 * - Cost function: Lower contour density = higher error
 * - Parameters: yPosition and curvature for each span
 * - Method: Gradient descent (adjust params in direction that reduces error)
 * - Learning rate: How much to adjust params each iteration (0.1 for position)
 *
 * Why gradient descent vs. Levenberg-Marquardt?
 * - This is a simpler problem (fewer parameters: 2 per span vs. 16 total)
 * - The cost function is noisy (contour density isn't perfectly smooth)
 * - Gradient descent is more robust to local minima for this type of problem
 */
export function refineSpans(
  initialSpans: Array<SpanParams>,
  contours: Array<{ x: number; y: number; width: number; height: number }>,
  imageWidth: number,
  imageHeight: number,
  kernelSize: number = 5,
  progressCallback?: DewarpProgressCallback
): {
  spans: Array<SpanParams>;
  iterations: number;
  error: number;
} {
  progressCallback?.("Span Detection", 25, "Computing contour density");

  const contourDensity = computeContourDensity(
    contours,
    imageWidth,
    imageHeight,
    kernelSize
  );

  progressCallback?.("Span Detection", 25, "Refining span positions");

  const numIterations = 50;
  const learningRate = 0.1;
  let currentSpans = initialSpans.map((s) => ({ ...s }));
  let bestError = Infinity;
  let iterations = 0;

  for (let iter = 0; iter < numIterations; iter++) {
    iterations = iter + 1;

    const error = evaluateSpanFit(currentSpans, contourDensity, imageWidth);

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
      contourDensity,
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
 * Evaluate how well spans match contour density.
 *
 * This is our cost/error function for span optimization.
 * Lower contour density = higher error = worse fit.
 *
 * Algorithm:
 * 1. For each span, sample 20 points along its curve
 * 2. Look up the contour density at each sample point
 * 3. Sum up the contour density for all points
 * 4. Convert to error: error = 1 / (density + 1)
 *    (Higher density → lower error)
 *
 * Why this works:
 * - Text regions have high contour density (detected text contours)
 * - Background areas have low contour density
 * - A span positioned along text will have high total density
 * - The optimization will push spans toward text regions
 */
function evaluateSpanFit(
  spans: Array<SpanParams>,
  contourDensity: Array<Array<number>>,
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
        y < contourDensity.length &&
        x >= 0 &&
        x < contourDensity[0].length
      ) {
        spanDensity += contourDensity[y][x];
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
  contourDensity: Array<Array<number>>,
  imageWidth: number,
  imageHeight: number
): Array<{ yGrad: number; cGrad: number }> {
  const epsilon = 0.1;
  const gradients: Array<{ yGrad: number; cGrad: number }> = [];

  for (const span of spans) {
    const baseError = evaluateSpanFit([span], contourDensity, imageWidth);

    const yPlus = { ...span, yPosition: span.yPosition + epsilon };
    const yPlusError = evaluateSpanFit([yPlus], contourDensity, imageWidth);
    const yGrad = (yPlusError - baseError) / epsilon;

    const cPlus = { ...span, curvature: span.curvature + epsilon };
    const cPlusError = evaluateSpanFit([cPlus], contourDensity, imageWidth);
    const cGrad = (cPlusError - baseError) / epsilon;

    gradients.push({ yGrad, cGrad });
  }

  return gradients;
}

/**
 * Fit cubic sheet model to keypoints using Levenberg-Marquardt.
 *
 * THE INVERSE PROBLEM (following Matt Zucker's page_dewarp.py):
 * ===========================================================
 * Given: Observed keypoint positions in the curved photo
 * Find: 3D cubic surface that, when projected, produces those positions
 *
 * Key insight:
 * - Keypoints are sampled from curved text lines (spans) in the photo
 * - On a FLAT page, these would be on straight horizontal lines
 * - We create a "flat grid" of where keypoints SHOULD be
 * - Then find the 3D surface that warps this flat grid → observed positions
 *
 * Algorithm:
 * 1. Create flat page positions (uniform grid)
 * 2. For current cubic coefficients:
 *    a. Take flat (x, y) position
 *    b. Evaluate cubic polynomial: z = f(x, y, coefficients)
 *    c. Project 3D point (x, y, z) → 2D position
 *    d. Compute error vs. observed position
 * 3. LM adjusts coefficients to minimize error
 *
 * This solves the inverse problem: observed 2D photo → inferred 3D shape
 */
export function fitCubicSheet(
  observedKeypoints: Array<Point2D>,
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

  if (observedKeypoints.length === 0) {
    console.warn(
      "[Dewarp Optimizer] No keypoints provided, using flat page model"
    );
    progressCallback?.(
      "Model Fitting",
      70,
      "No keypoints, using flat page model"
    );
    return {
      params: createFlatSheetParams(),
      iterations: 0,
      error: 0,
    };
  }

  const normalizedObserved = observedKeypoints.map((p) => ({
    x: (p.x - imageWidth / 2) / imageWidth,
    y: (p.y - imageHeight / 2) / imageHeight,
  }));

  const numKeypoints = observedKeypoints.length;
  const minY = Math.min(...normalizedObserved.map((p) => p.y));
  const maxY = Math.max(...normalizedObserved.map((p) => p.y));
  const yRange = maxY - minY;

  const flatPositions = observedKeypoints.map((p, i) => {
    const normalizedX = (p.x - imageWidth / 2) / imageWidth;

    const rowProgress = i / numKeypoints;
    const flatY = minY + rowProgress * yRange;

    return { x: normalizedX, y: flatY };
  });

  const focalLength = Math.max(imageWidth, imageHeight);

  const initialParams = createFlatSheetParams();
  const x0 = initialParams.coefficients;

  progressCallback?.(
    "Model Fitting",
    45,
    `Running Levenberg-Marquardt optimization for ${numKeypoints} keypoints`
  );

  const fittedParams = [...x0];
  let iterations = 0;
  let finalError = 0;

  const sampleCount = numKeypoints;
  const constraintX: Array<number> = [];
  const constraintTargets: Array<number> = [];

  for (let i = 0; i < sampleCount; i++) {
    constraintX.push(i); // Y constraint
    constraintTargets.push(normalizedObserved[i].y);

    constraintX.push(sampleCount + i); // X constraint (offset)
    constraintTargets.push(normalizedObserved[i].x);
  }

  const evaluateProjection = (
    coefficients: Array<number>,
    sampleIndex: number
  ): { normX: number; normY: number } => {
    const flatPos = flatPositions[sampleIndex];

    const z = evaluateCubicPolynomial(flatPos.x, flatPos.y, coefficients);

    const point3D = {
      x: flatPos.x * imageWidth,
      y: flatPos.y * imageHeight,
      z: z * focalLength,
    };

    const projected = project3DTo2D(point3D, focalLength, {
      x: imageWidth / 2,
      y: imageHeight / 2,
    });

    return {
      normX: (projected.x - imageWidth / 2) / imageWidth,
      normY: (projected.y - imageHeight / 2) / imageHeight,
    };
  };

  try {
    const result = levenbergMarquardt(
      { x: constraintX, y: constraintTargets },
      (coefficients: Array<number>) => (t: number) => {
        const isXConstraint = t >= sampleCount;
        const sampleIndex = Math.floor(t % sampleCount);
        const projection = evaluateProjection(coefficients, sampleIndex);

        return isXConstraint ? projection.normX : projection.normY;
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
 * Compute density map from detected text contours.
 *
 * This creates a "heat map" showing where text is located based on contour rectangles.
 * Similar to edge density, but derived from contour positions rather than edge pixels.
 *
 * WHY CONTOUR DENSITY:
 * - Text contours indicate where text regions are located
 * - A well-positioned span should pass through text regions
 * - We smooth the contour presence using a kernel for continuous optimization
 *
 * Algorithm:
 * 1. Create a binary map indicating contour presence
 * 2. Apply smoothing kernel (average over neighborhood)
 * 3. Return normalized density values
 */
export function computeContourDensity(
  contours: Array<{ x: number; y: number; width: number; height: number }>,
  imageWidth: number,
  imageHeight: number,
  kernelSize: number = 5
): Array<Array<number>> {
  const binaryMap: Array<Array<number>> = [];
  for (let y = 0; y < imageHeight; y++) {
    binaryMap.push(new Array(imageWidth).fill(0));
  }

  for (const contour of contours) {
    const { x, width, height } = contour;
    const y = contour.y;

    for (
      let cy = Math.max(0, Math.floor(y));
      cy < Math.min(imageHeight, Math.ceil(y + height));
      cy++
    ) {
      for (
        let cx = Math.max(0, Math.floor(x));
        cx < Math.min(imageWidth, Math.ceil(x + width));
        cx++
      ) {
        binaryMap[cy][cx] = 255;
      }
    }
  }

  const density: Array<Array<number>> = [];

  for (let y = 0; y < imageHeight; y++) {
    const row: Array<number> = [];
    for (let x = 0; x < imageWidth; x++) {
      let sum = 0;
      let count = 0;

      for (let dy = -kernelSize; dy <= kernelSize; dy++) {
        for (let dx = -kernelSize; dx <= kernelSize; dx++) {
          const ny = y + dy;
          const nx = x + dx;

          if (ny >= 0 && ny < imageHeight && nx >= 0 && nx < imageWidth) {
            sum += binaryMap[ny][nx];
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

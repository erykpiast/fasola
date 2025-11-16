/**
 * Core mathematical utilities for page dewarping.
 * Implements cubic polynomial evaluation, 3D projection, and span parameterization.
 *
 * ALGORITHM OVERVIEW:
 * ==================
 * The page dewarping algorithm models a curved page as a 3D surface in space,
 * then determines how that surface projects onto the camera's 2D image plane.
 *
 * Key concepts:
 * 1. CUBIC SHEET MODEL: The page is represented as a cubic polynomial surface
 *    z(x, y) = sum of c_ij * x^i * y^j for i,j = 0..3
 *    This gives us 16 coefficients that describe the page's curvature.
 *
 * 2. TEXT SPANS: Horizontal lines of text that follow the page's curvature.
 *    We detect these spans and sample keypoints along them.
 *
 * 3. PROJECTION: Each point on the 3D curved surface projects to a specific
 *    location in the 2D photograph. We model this with perspective projection.
 *
 * 4. INVERSE MAPPING: Once we know the surface shape, we can map any point
 *    on a flat output image back to where it came from in the curved input,
 *    effectively "unwarping" the page.
 */

/**
 * Progress callback for reporting algorithm status.
 */
export type DewarpProgressCallback = (
  phase: string,
  progress: number,
  message: string
) => void;

/**
 * 2D point in image coordinates.
 */
export interface Point2D {
  x: number;
  y: number;
}

/**
 * 3D point in world coordinates.
 */
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Cubic polynomial coefficients (16 parameters for cubic sheet).
 */
export interface CubicSheetParams {
  coefficients: Array<number>;
}

/**
 * Span line parameters (position and curvature).
 */
export interface SpanParams {
  yPosition: number;
  curvature: number;
}

/**
 * Mathematical validation results.
 */
export interface MathValidation {
  polynomialTest: boolean;
  projectionTest: boolean;
}

/**
 * Evaluate a cubic polynomial at a given point.
 * z(x, y) = Σ(i=0..3) Σ(j=0..3) c_ij * x^i * y^j
 *
 * This is the heart of the cubic sheet model. The function takes a 2D point
 * on the page (x, y) and computes its height (z) above the flat plane.
 *
 * For a flat page, all coefficients would be zero except c_00.
 * For a curved page (like an open book), the coefficients capture:
 * - Linear terms (x, y): overall tilt
 * - Quadratic terms (x², xy, y²): cylindrical curves (like book binding)
 * - Cubic terms (x³, x²y, xy², y³): more complex warping
 *
 * The 16 coefficients are arranged as:
 * [c_00, c_01, c_02, c_03,  // constant, y, y², y³
 *  c_10, c_11, c_12, c_13,  // x, xy, xy², xy³
 *  c_20, c_21, c_22, c_23,  // x², x²y, x²y², x²y³
 *  c_30, c_31, c_32, c_33]  // x³, x³y, x³y², x³y³
 */
export function evaluateCubicPolynomial(
  x: number,
  y: number,
  coefficients: Array<number>
): number {
  if (coefficients.length !== 16) {
    throw new Error("Cubic polynomial requires exactly 16 coefficients");
  }

  let z = 0;
  let index = 0;

  for (let i = 0; i <= 3; i++) {
    for (let j = 0; j <= 3; j++) {
      const term = coefficients[index] * Math.pow(x, i) * Math.pow(y, j);
      z += term;
      index++;
    }
  }

  return z;
}

/**
 * Compute the gradient of the cubic polynomial at a point.
 * Returns [dz/dx, dz/dy].
 *
 * The gradient tells us how steeply the surface is sloping in each direction.
 * This is useful for:
 * - Optimization (finding the direction to adjust parameters)
 * - Visualizing the surface curvature
 * - Understanding how the page bends at each location
 *
 * We compute partial derivatives:
 * dz/dx = Σ(i=1..3) Σ(j=0..3) c_ij * i * x^(i-1) * y^j
 * dz/dy = Σ(i=0..3) Σ(j=1..3) c_ij * j * x^i * y^(j-1)
 */
export function cubicPolynomialGradient(
  x: number,
  y: number,
  coefficients: Array<number>
): [number, number] {
  if (coefficients.length !== 16) {
    throw new Error("Cubic polynomial requires exactly 16 coefficients");
  }

  let dzDx = 0;
  let dzDy = 0;
  let index = 0;

  for (let i = 0; i <= 3; i++) {
    for (let j = 0; j <= 3; j++) {
      const coef = coefficients[index];

      if (i > 0) {
        dzDx += coef * i * Math.pow(x, i - 1) * Math.pow(y, j);
      }

      if (j > 0) {
        dzDy += coef * j * Math.pow(x, i) * Math.pow(y, j - 1);
      }

      index++;
    }
  }

  return [dzDx, dzDy];
}

/**
 * Project a 3D point to 2D image coordinates using a simple perspective model.
 * Assumes camera at origin looking down the z-axis.
 *
 * PERSPECTIVE PROJECTION EXPLAINED:
 * =================================
 * When a camera photographs a 3D object, points closer to the camera appear
 * larger than points farther away. This is perspective distortion.
 *
 * Our model:
 * - Camera is at position (0, 0, 0) looking down the +z axis
 * - The page is in front of the camera (positive z)
 * - Focal length determines the camera's "zoom" (larger = more zoomed in)
 *
 * The projection formula:
 * - Points farther from camera (larger z) appear smaller
 * - scale = focalLength / (focalLength + z)
 * - x_2d = x_3d * scale + center_x
 * - y_2d = y_3d * scale + center_y
 *
 * For a curved page, points that bulge toward the camera (positive z) will
 * appear larger/displaced in the photo compared to flat regions.
 */
export function project3DTo2D(
  point3D: Point3D,
  focalLength: number = 1000,
  imageCenter: Point2D = { x: 0, y: 0 }
): Point2D {
  const scale = focalLength / (focalLength + point3D.z);

  return {
    x: point3D.x * scale + imageCenter.x,
    y: point3D.y * scale + imageCenter.y,
  };
}

/**
 * Parameterize a span line (text baseline).
 * A span is a horizontal line with possible curvature.
 *
 * TEXT SPANS EXPLAINED:
 * ====================
 * In a photograph of a page, lines of text appear curved due to the page's
 * warping. We call these curved text lines "spans".
 *
 * Each span is characterized by:
 * - yPosition: The vertical position of the span (middle of the page, etc.)
 * - curvature: How much the span curves (0 = straight, positive = curves down)
 *
 * The span follows a parabolic curve:
 * y(x) = yPosition + curvature * normalizedX²
 *
 * where normalizedX ranges from -0.5 to 0.5 across the page width.
 * This gives a symmetric curve that's useful for modeling text on curved pages.
 *
 * We sample points along these spans to get "keypoints" - known correspondences
 * between the curved photo and where they should be on a flat page.
 */
export function parameterizeSpan(
  xPosition: number,
  spanParams: SpanParams,
  imageWidth: number
): Point2D {
  const normalizedX = (xPosition - imageWidth / 2) / imageWidth;

  const yOffset = spanParams.curvature * normalizedX * normalizedX;

  return {
    x: xPosition,
    y: spanParams.yPosition + yOffset,
  };
}

/**
 * Sample keypoints along a span line.
 */
export function sampleKeypointsOnSpan(
  spanParams: SpanParams,
  imageWidth: number,
  numSamples: number
): Array<Point2D> {
  const keypoints: Array<Point2D> = [];
  const step = imageWidth / (numSamples - 1);

  for (let i = 0; i < numSamples; i++) {
    const x = i * step;
    const point = parameterizeSpan(x, spanParams, imageWidth);
    keypoints.push(point);
  }

  return keypoints;
}

/**
 * Create initial cubic sheet parameters (flat page).
 */
export function createFlatSheetParams(): CubicSheetParams {
  const coefficients = new Array(16).fill(0);

  return { coefficients };
}

/**
 * Validate mathematical functions.
 */
export function validateMathFunctions(): MathValidation {
  const polynomialTest = testCubicPolynomial();
  const projectionTest = testProjection();

  console.log("[Dewarp Core] Math validation:", {
    polynomialTest,
    projectionTest,
  });

  return {
    polynomialTest,
    projectionTest,
  };
}

/**
 * Test cubic polynomial evaluation.
 */
function testCubicPolynomial(): boolean {
  try {
    const flatCoefficients = new Array(16).fill(0);
    flatCoefficients[0] = 1;

    const result = evaluateCubicPolynomial(0.5, 0.5, flatCoefficients);

    if (Math.abs(result - 1.0) > 1e-10) {
      console.error(
        "[Dewarp Core] Polynomial test failed: expected 1.0, got",
        result
      );
      return false;
    }

    const [gradX, gradY] = cubicPolynomialGradient(0.5, 0.5, flatCoefficients);

    if (Math.abs(gradX) > 1e-10 || Math.abs(gradY) > 1e-10) {
      console.error(
        "[Dewarp Core] Gradient test failed: expected [0, 0], got",
        [gradX, gradY]
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("[Dewarp Core] Polynomial test error:", error);
    return false;
  }
}

/**
 * Test 3D to 2D projection.
 */
function testProjection(): boolean {
  try {
    const point3D: Point3D = { x: 100, y: 200, z: 0 };
    const projected = project3DTo2D(point3D, 1000, { x: 0, y: 0 });

    if (
      Math.abs(projected.x - 100) > 1e-6 ||
      Math.abs(projected.y - 200) > 1e-6
    ) {
      console.error(
        "[Dewarp Core] Projection test failed: expected (100, 200), got",
        projected
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("[Dewarp Core] Projection test error:", error);
    return false;
  }
}

/**
 * Initialize phase reporting.
 */
export function reportPhaseInit(
  progressCallback?: DewarpProgressCallback
): void {
  if (progressCallback) {
    progressCallback("Initialization", 0, "Initializing core algorithms");
  }

  const validation = validateMathFunctions();

  if (progressCallback) {
    const message =
      validation.polynomialTest && validation.projectionTest
        ? "Core algorithms validated"
        : "Warning: Some validation tests failed";

    progressCallback("Initialization", 5, message);
  }
}

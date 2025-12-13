/**
 * Illumination correction to normalize uneven lighting
 * Uses background estimation and division normalization
 */

interface Mat {
  rows: number;
  cols: number;
  delete(): void;
  isDeleted(): boolean;
}

interface Size {
  new (width: number, height: number): Size;
}

interface CV {
  Mat: {
    new (): Mat;
  };
  Size: Size;
  GaussianBlur(
    src: Mat,
    dst: Mat,
    ksize: Size,
    sigmaX: number,
    sigmaY?: number
  ): void;
  divide(src1: Mat, src2: Mat, dst: Mat, scale?: number): void;
  multiply(src: Mat, alpha: number, dst: Mat): void;
  add(src1: Mat, src2: Mat, dst: Mat): void;
  cvtColor(src: Mat, dst: Mat, code: number): void;
  COLOR_BGR2GRAY: number;
  COLOR_GRAY2BGR: number;
}

/**
 * Apply illumination correction to normalize lighting
 * Estimates and removes background illumination gradient
 */
export function applyIlluminationCorrection(cv: CV, src: Mat): Mat {
  console.log("  Applying illumination correction");

  // Convert to grayscale for background estimation
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_BGR2GRAY);

  // Estimate background using large Gaussian blur
  // Kernel size should be large enough to capture illumination gradient
  const kernelSize = Math.max(
    Math.floor(Math.min(gray.rows, gray.cols) * 0.1),
    15
  );
  const ksize = kernelSize % 2 === 0 ? kernelSize + 1 : kernelSize; // Must be odd

  const background = new cv.Mat();
  cv.GaussianBlur(gray, background, new cv.Size(ksize, ksize), 0);

  // Normalize: divide original by background
  // Add small constant to avoid division by zero
  // Use addWeighted to add scalar: dst = src1*alpha + src2*beta + gamma
  const backgroundWithEpsilon = new cv.Mat();
  (cv as any).addWeighted(
    background,
    1.0,
    background,
    0.0,
    1.0,
    backgroundWithEpsilon
  );

  const normalized = new cv.Mat();
  cv.divide(gray, backgroundWithEpsilon, normalized, 255.0);

  // Convert back to BGR
  const result = new cv.Mat();
  cv.cvtColor(normalized, result, cv.COLOR_GRAY2BGR);

  // Cleanup
  gray.delete();
  background.delete();
  backgroundWithEpsilon.delete();
  normalized.delete();

  return result;
}

/**
 * White balance correction algorithms
 * Adjusts color channels to neutralize color casts
 */

interface Mat {
  rows: number;
  cols: number;
  data: Uint8Array;
  channels(): number;
  delete(): void;
  isDeleted(): boolean;
}

interface MatVector {
  get(index: number): Mat;
  delete(): void;
  size(): number;
  push_back(mat: Mat): void;
}

interface Scalar {
  new (...values: Array<number>): Scalar;
}

interface CV {
  Mat: {
    new (): Mat;
  };
  MatVector: new () => MatVector;
  Scalar: Scalar;
  split(src: Mat, dst: MatVector): void;
  merge(src: MatVector, dst: Mat): void;
  mean(src: Mat): Scalar;
  multiply(src1: Mat, src2: number | Scalar, dst: Mat): void;
  minMaxLoc(src: Mat): { maxVal: number };
}

type WhiteBalanceAlgorithm = "gray-world" | "simple" | "none";

/**
 * Apply white balance correction to an image
 */
export function applyWhiteBalance(
  cv: CV,
  src: Mat,
  algorithm: WhiteBalanceAlgorithm
): Mat {
  if (algorithm === "none") {
    return src;
  }

  console.log(`  Applying white balance (${algorithm})`);

  if (algorithm === "gray-world") {
    return grayWorldWhiteBalance(cv, src);
  } else if (algorithm === "simple") {
    return simpleWhiteBalance(cv, src);
  }

  return src;
}

/**
 * Gray-World white balance
 * Assumes the average color in the image should be neutral gray
 */
function grayWorldWhiteBalance(cv: CV, src: Mat): Mat {
  // Split into BGR channels
  const channels = new cv.MatVector();
  cv.split(src, channels);

  const bChannel = channels.get(0);
  const gChannel = channels.get(1);
  const rChannel = channels.get(2);

  // Calculate mean for each channel
  const meanB = cv.mean(bChannel)[0];
  const meanG = cv.mean(gChannel)[0];
  const meanR = cv.mean(rChannel)[0];

  // Calculate overall gray mean
  const grayMean = (meanB + meanG + meanR) / 3;

  // Scale each channel to match gray mean
  const scaleB = grayMean / meanB;
  const scaleG = grayMean / meanG;
  const scaleR = grayMean / meanR;

  const bScaled = new cv.Mat();
  const gScaled = new cv.Mat();
  const rScaled = new cv.Mat();

  // Scale each channel by multiplying with scalar (not squaring!)
  (cv as any).convertScaleAbs(bChannel, bScaled, scaleB, 0);
  (cv as any).convertScaleAbs(gChannel, gScaled, scaleG, 0);
  (cv as any).convertScaleAbs(rChannel, rScaled, scaleR, 0);

  // Merge back
  const result = new cv.Mat();
  const scaledChannels = new cv.MatVector();
  scaledChannels.push_back(bScaled);
  scaledChannels.push_back(gScaled);
  scaledChannels.push_back(rScaled);

  cv.merge(scaledChannels, result);

  // Cleanup
  channels.delete();
  bScaled.delete();
  gScaled.delete();
  rScaled.delete();
  scaledChannels.delete();

  return result;
}

/**
 * Simple white balance
 * Uses the brightest pixels as white reference
 */
function simpleWhiteBalance(cv: CV, src: Mat): Mat {
  // Split into BGR channels
  const channels = new cv.MatVector();
  cv.split(src, channels);

  const bChannel = channels.get(0);
  const gChannel = channels.get(1);
  const rChannel = channels.get(2);

  // Find max value for each channel
  const maxB = cv.minMaxLoc(bChannel).maxVal;
  const maxG = cv.minMaxLoc(gChannel).maxVal;
  const maxR = cv.minMaxLoc(rChannel).maxVal;

  // Scale to normalize brightest pixels to 255
  const scaleB = 255 / maxB;
  const scaleG = 255 / maxG;
  const scaleR = 255 / maxR;

  const bScaled = new cv.Mat();
  const gScaled = new cv.Mat();
  const rScaled = new cv.Mat();

  // Scale each channel by multiplying with scalar (not squaring!)
  (cv as any).convertScaleAbs(bChannel, bScaled, scaleB, 0);
  (cv as any).convertScaleAbs(gChannel, gScaled, scaleG, 0);
  (cv as any).convertScaleAbs(rChannel, rScaled, scaleR, 0);

  // Merge back
  const result = new cv.Mat();
  const scaledChannels = new cv.MatVector();
  scaledChannels.push_back(bScaled);
  scaledChannels.push_back(gScaled);
  scaledChannels.push_back(rScaled);

  cv.merge(scaledChannels, result);

  // Cleanup
  channels.delete();
  bScaled.delete();
  gScaled.delete();
  rScaled.delete();
  scaledChannels.delete();

  return result;
}

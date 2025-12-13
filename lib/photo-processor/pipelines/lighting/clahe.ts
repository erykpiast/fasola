/**
 * CLAHE (Contrast Limited Adaptive Histogram Equalization) implementation
 * Uses OpenCV's built-in CLAHE for local contrast enhancement
 */

interface Mat {
  delete(): void;
  isDeleted(): boolean;
}

interface MatVector {
  get(index: number): Mat;
  delete(): void;
  size(): number;
}

interface Size {
  new (width: number, height: number): Size;
}

interface CLAHE {
  new (clipLimit: number, tileGridSize: Size): CLAHE;
  apply(src: Mat, dst: Mat): void;
  delete(): void;
}

interface CV {
  Mat: {
    new (): Mat;
  };
  MatVector: new () => MatVector;
  Size: Size;
  CLAHE: CLAHE;
  cvtColor(src: Mat, dst: Mat, code: number): void;
  split(src: Mat, dst: MatVector): void;
  merge(src: MatVector, dst: Mat): void;
  COLOR_BGR2Lab: number;
  COLOR_Lab2BGR: number;
}

/**
 * Apply CLAHE to enhance local contrast
 * Operates on the L channel in LAB color space
 */
export function applyCLAHE(
  cv: CV,
  src: Mat,
  clipLimit: number,
  tileSize: number
): Mat {
  console.log(
    `  Applying CLAHE (clipLimit=${clipLimit}, tileSize=${tileSize})`
  );

  // Convert to LAB color space
  const lab = new cv.Mat();
  cv.cvtColor(src, lab, cv.COLOR_BGR2Lab);

  // Split into L, A, B channels
  const labChannels = new cv.MatVector();
  cv.split(lab, labChannels);

  // Apply CLAHE only to L channel
  const clahe = new cv.CLAHE(clipLimit, new cv.Size(tileSize, tileSize));
  const lChannel = labChannels.get(0);
  const lEnhanced = new cv.Mat();
  clahe.apply(lChannel, lEnhanced);

  // Replace L channel with enhanced version
  const enhancedChannels = new cv.MatVector();
  enhancedChannels.push_back(lEnhanced);
  enhancedChannels.push_back(labChannels.get(1)); // A channel
  enhancedChannels.push_back(labChannels.get(2)); // B channel

  // Merge back
  const result = new cv.Mat();
  cv.merge(enhancedChannels, result);

  // Convert back to BGR
  const output = new cv.Mat();
  cv.cvtColor(result, output, cv.COLOR_Lab2BGR);

  // Cleanup
  lab.delete();
  labChannels.delete();
  clahe.delete();
  lEnhanced.delete();
  enhancedChannels.delete();
  result.delete();

  return output;
}

/**
 * Illumination correction to normalize uneven lighting
 * Uses background estimation and division normalization
 */

import type { CV, CVMat } from "../../types/opencv";

/**
 * Apply illumination correction to normalize lighting
 * Processes only the luminance channel in LAB color space to preserve colors
 */
export function applyIlluminationCorrection(cv: CV, src: CVMat): CVMat {
  console.log("  Applying illumination correction");

  // Convert to LAB color space
  const lab = new cv.Mat();
  cv.cvtColor(src, lab, cv.COLOR_BGR2Lab);

  // Split into L, A, B channels
  const labChannels = new cv.MatVector();
  cv.split(lab, labChannels);

  const lChannel = labChannels.get(0);
  const aChannel = labChannels.get(1);
  const bChannel = labChannels.get(2);

  // Estimate background using large Gaussian blur on L channel
  // Kernel size should be large enough to capture illumination gradient
  const kernelSize = Math.max(
    Math.floor(Math.min(lChannel.rows, lChannel.cols) * 0.1),
    15
  );
  const ksize = kernelSize % 2 === 0 ? kernelSize + 1 : kernelSize; // Must be odd

  const background = new cv.Mat();
  cv.GaussianBlur(lChannel, background, new cv.Size(ksize, ksize), 0);

  // Normalize: divide L channel by background
  // Add small constant to avoid division by zero
  const backgroundWithEpsilon = new cv.Mat();
  cv.addWeighted(background, 1.0, background, 0.0, 1.0, backgroundWithEpsilon);

  const normalizedL = new cv.Mat();
  cv.divide(lChannel, backgroundWithEpsilon, normalizedL, 255.0);

  // Merge back with original A and B channels
  const normalizedChannels = new cv.MatVector();
  normalizedChannels.push_back(normalizedL);
  normalizedChannels.push_back(aChannel);
  normalizedChannels.push_back(bChannel);

  const normalizedLab = new cv.Mat();
  cv.merge(normalizedChannels, normalizedLab);

  // Convert back to BGR
  const result = new cv.Mat();
  cv.cvtColor(normalizedLab, result, cv.COLOR_Lab2BGR);

  // Cleanup
  lab.delete();
  labChannels.delete();
  lChannel.delete();
  aChannel.delete();
  bChannel.delete();
  background.delete();
  backgroundWithEpsilon.delete();
  normalizedL.delete();
  normalizedChannels.delete();
  normalizedLab.delete();

  return result;
}

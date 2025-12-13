/**
 * Denoising implementation using bilateral filter
 * Reduces noise while preserving edges (important for text readability)
 */

import type { CV, CVMat } from "../../types/opencv";

/**
 * Apply bilateral filter for edge-preserving denoising
 * @param cv - OpenCV instance
 * @param src - Source image (BGR)
 * @param strength - Denoise strength (3-7), controls both sigmaColor and sigmaSpace
 * @returns Denoised image
 */
export function applyDenoise(cv: CV, src: CVMat, strength: number): CVMat {
  console.log(`  Applying bilateral filter (strength=${strength})`);

  const denoised = new cv.Mat();

  // Bilateral filter parameters:
  // - d: diameter of pixel neighborhood (0 = computed from sigmaSpace)
  // - sigmaColor: filter sigma in color space (larger = colors farther apart will mix)
  // - sigmaSpace: filter sigma in coordinate space (larger = farther pixels influence each other)
  const d = 0; // Auto-compute from sigmaSpace
  const sigmaColor = strength * 10; // Scale for color domain
  const sigmaSpace = strength; // Use strength directly for spatial domain

  cv.bilateralFilter(src, denoised, d, sigmaColor, sigmaSpace);

  return denoised;
}


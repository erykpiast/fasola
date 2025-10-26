Implement imported photo adjustment engine which will increase recipe readability on the photos taken in non-ideal
conditions. The adjusted photo of the book should look like the book was scanned.

The solution should be based on OpenCV. To start simple and allow testing the application easily via Expo Go, we should
use OpenCV.js embedded in web view (via the `@techstark/opencv-js` NPM package).

The processing pipeline should take about several aspects:

 * geometry - the photographed book page should be as close to a rectangle as possible
 * lightning - the page should be evenly lightened, without shadows, and with high contrast
 * sharpness - it should be easy to read the text on the photo

Here's an example, high-level design of the pipeline:

## Geometry

1. Downscale for robust quad detection → page contour → perspective warp.
   Optional: refine skew after warp (text orientation; tiny rotations).
2. (Optional) lens undistort if you’ve camera-calibrated.

# Lighting / appearance

1. Neutralize white balance → remove uneven illumination (divide by smooth background) → local contrast (CLAHE).
   Optional: light shadow suppression (black-hat background removal).

## Clarity

1. Denoise (gentle) → unsharp mask on luma for crisp text (guard against halos).
   Optional toggles: B/W binarization, high-res export, PDF assembly.

## Quality gates

1. Focus metric (variance of Laplacian), page coverage %, glare %, angle sanity → “retake” prompts.

## Practical defaults (tunable)

 * Contour detect: Canny (σ auto from median), closing (3×3), keep largest convex 4-sided polygon, min area ≥ 20–30% of frame.
 * Warp: map to rectangle with size from side lengths; padding (1–2%).
 * WB: Gray-world (safe), or xphoto’s SimpleWB/GrayworldWB if present.
 * Illumination: estimate background with large Gaussian blur on L channel (σ ≈ min(W,H)/30), then divide, rescale.
 * CLAHE: clipLimit 2.0–3.5, tileGrid 8×8 on L channel.
 * Denoise: fastNlMeans h=3–7 (color) or bilateral d=5–9, σ=35–50 if you want to preserve edges strongly.
 * Sharpen: unsharp on L channel, radius 1.2–1.8 px, amount 0.8–1.4, threshold 2–4 (avoid lifting JPEG noise).
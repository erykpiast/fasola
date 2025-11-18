#!/usr/bin/env tsx

/**
 * Test script for the photo-processor pipeline.
 * Runs the full pipeline (preprocessing -> optimization -> geometry correction)
 * and outputs debug artifacts and the corrected image.
 *
 * Usage:
 *   npm install --save-dev canvas tsx
 *   npx tsx lib/photo-processor/test-pipeline.ts <image-path>
 *
 * Example:
 *   npx tsx lib/photo-processor/test-pipeline.ts lib/photo-processor/pipelines/test-images/book.jpeg
 */

// Setup Node.js environment first (before any other imports)
import "./test-setup";

import type { Mat } from "@techstark/opencv-js";
import cvPromise from "@techstark/opencv-js";
import { createCanvas, loadImage } from "canvas";
import * as fs from "fs";
import * as path from "path";
import type { OpenCVPreprocessing } from "./opencv";
import { applyGeometryCorrection } from "./pipelines/opencv-core";
import type { OpenCVRemap } from "./pipelines/page-dewarp-remap";
import type { DewarpDebugData } from "./types";

/**
 * Save a data URL to a file.
 */
function saveDataUrl(dataUrl: string, outputPath: string): void {
  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  fs.writeFileSync(outputPath, buffer);
  console.log(`Saved: ${outputPath}`);
}

/**
 * Load image to OpenCV Mat using canvas.
 */
async function loadImageToMat(cv: any, imagePath: string): Promise<Mat> {
  const img = await loadImage(imagePath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const mat = cv.matFromImageData(imageData);

  return mat;
}

/**
 * Convert Mat to data URL using canvas.
 */
function matToDataUrl(cv: any, mat: Mat, quality: number = 0.92): string {
  const canvas = createCanvas(mat.cols, mat.rows);
  cv.imshow(canvas, mat);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Save all debug artifacts to the debug directory.
 */
function saveDebugArtifacts(
  debugData: DewarpDebugData,
  debugDir: string
): void {
  console.log("\n=== Saving Debug Artifacts ===");

  // Save all debug images
  const debugImages: Array<{ name: string; data?: string }> = [
    { name: "01_edges.png", data: debugData.edges },
    { name: "02_binary_text.png", data: debugData.binaryText },
    { name: "03_eroded_text.png", data: debugData.erodedText },
    { name: "04_edge_map.png", data: debugData.edgeMap },
    { name: "05_detected_lines.png", data: debugData.detectedLines },
    { name: "06_fitted_lines.png", data: debugData.fittedLines },
    { name: "07_page_boundary.png", data: debugData.pageBoundary },
    { name: "08_span_estimates.png", data: debugData.spanEstimates },
    { name: "09_detected_spans.png", data: debugData.detectedSpans },
    { name: "10_keypoint_cloud.png", data: debugData.keypointCloud },
    { name: "11_mesh_grid.png", data: debugData.meshGrid },
    { name: "12_before_after.png", data: debugData.beforeAfter },
    { name: "13_surface_mesh.png", data: debugData.surfaceMesh },
  ];

  for (const { name, data } of debugImages) {
    if (data) {
      const outputPath = path.join(debugDir, name);
      saveDataUrl(data, outputPath);
    }
  }

  // Save text reports
  const statsReport = `
=== Preprocessing Statistics ===
Contours Found: ${debugData.preprocessingStats.contoursFound}
Lines Detected: ${debugData.preprocessingStats.linesDetected}
Page Bounds: ${debugData.preprocessingStats.pageBounds.width}x${
    debugData.preprocessingStats.pageBounds.height
  }

=== Optimization Metrics ===
Span Iterations: ${debugData.optimizationMetrics.spanIterations}
Span Error: ${debugData.optimizationMetrics.spanError.toFixed(6)}
Model Iterations: ${debugData.optimizationMetrics.modelIterations}
Model Error: ${debugData.optimizationMetrics.modelError.toFixed(6)}

=== Model Parameters ===
${debugData.optimizationMetrics.parameters
  .map((p, i) => `  c[${i}]: ${p.toFixed(8)}`)
  .join("\n")}

=== Remap Statistics ===
Output Resolution: ${debugData.remapStats.resolution.width}x${
    debugData.remapStats.resolution.height
  }
Interpolation: ${debugData.remapStats.interpolation}

=== Processing Time ===
Total: ${debugData.processingTime}ms

=== Math Validation ===
Polynomial Test: ${debugData.mathValidation?.polynomialTest ? "PASS" : "FAIL"}
Projection Test: ${debugData.mathValidation?.projectionTest ? "PASS" : "FAIL"}
  `.trim();

  fs.writeFileSync(path.join(debugDir, "stats.txt"), statsReport);
  console.log(`Saved: ${path.join(debugDir, "stats.txt")}`);

  // Save progress log
  const progressLog = debugData.progressLog
    .map((entry) => `[${entry.timestamp}ms] ${entry.phase}: ${entry.message}`)
    .join("\n");

  fs.writeFileSync(path.join(debugDir, "progress.log"), progressLog);
  console.log(`Saved: ${path.join(debugDir, "progress.log")}`);

  // Save full debug data as JSON
  const jsonData = {
    preprocessingStats: debugData.preprocessingStats,
    optimizationMetrics: debugData.optimizationMetrics,
    remapStats: debugData.remapStats,
    processingTime: debugData.processingTime,
    mathValidation: debugData.mathValidation,
    progressLog: debugData.progressLog,
  };

  fs.writeFileSync(
    path.join(debugDir, "debug-data.json"),
    JSON.stringify(jsonData, null, 2)
  );
  console.log(`Saved: ${path.join(debugDir, "debug-data.json")}`);
}

/**
 * Main test function.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: npx tsx test-pipeline.ts <image-path>");
    console.error("\nExample:");
    console.error("  npx tsx test-pipeline.ts pipelines/test-images/book.jpeg");
    process.exit(1);
  }

  const imagePath = args[0];
  const imageBasename = path.basename(imagePath, path.extname(imagePath));
  const imageDirectory = path.dirname(imagePath);
  const debugDir = path.join(imageDirectory, "correction_debug");
  const outputPath = path.join(
    imageDirectory,
    `${imageBasename}_corrected.jpeg`
  );

  console.log("=== Photo Processor Pipeline Test ===");
  console.log(`Input Image: ${imagePath}`);
  console.log(`Debug Directory: ${debugDir}`);
  console.log(`Output Image: ${outputPath}`);
  console.log("");

  // Ensure debug directory exists
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
    console.log(`Created debug directory: ${debugDir}`);
  }

  // Clear debug directory
  const debugFiles = fs.readdirSync(debugDir);
  for (const file of debugFiles) {
    fs.unlinkSync(path.join(debugDir, file));
  }
  console.log("Cleared debug directory\n");

  try {
    // Load OpenCV
    console.log("Loading OpenCV.js...");
    const cv = (await cvPromise) as unknown as OpenCVPreprocessing &
      OpenCVRemap;
    console.log("OpenCV.js loaded successfully\n");

    // Load image
    console.log("Loading image...");
    const srcMat = await loadImageToMat(cv, imagePath);
    console.log(
      `Image loaded: ${srcMat.cols}x${
        srcMat.rows
      } (${srcMat.channels()} channels)\n`
    );

    // Run the full pipeline with debug enabled
    console.log("Running pipeline...\n");
    const result = await applyGeometryCorrection(cv, srcMat, true);

    if (!result.mat) {
      console.error("Pipeline failed to produce output");
      process.exit(1);
    }

    console.log("\n=== Pipeline Complete ===\n");

    // Save corrected image
    const correctedDataUrl = matToDataUrl(cv, result.mat, 0.95);
    saveDataUrl(correctedDataUrl, outputPath);

    // Save debug artifacts
    if (result.debug) {
      saveDebugArtifacts(result.debug, debugDir);
    } else {
      console.warn("No debug data available");
    }

    // Clean up
    srcMat.delete();
    result.mat.delete();

    console.log("\n=== Test Complete ===");
    console.log(`Processing time: ${result.debug?.processingTime || 0}ms`);
  } catch (error) {
    console.error("\n=== Pipeline Error ===");
    console.error(error);
    process.exit(1);
  }
}

// Run the test
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

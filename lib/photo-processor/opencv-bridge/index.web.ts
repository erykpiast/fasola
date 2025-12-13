import type { DataUrl } from "@/lib/types/primitives";
import type { JSX } from "react";
import { applyGeometryCorrection } from "../pipelines/geometry";
import type { PhotoAdjustmentConfig } from "../types";
import type { GeometryProcessingResult } from "./types";

/**
 * Web implementation: Direct browser-compatible OpenCV processing
 */
export async function processGeometry(
  imageUri: DataUrl,
  config: Partial<PhotoAdjustmentConfig["geometry"]>
): Promise<GeometryProcessingResult> {
  try {
    console.log("[OpenCV Bridge] Starting geometry correction (web/opencv)");

    // Apply geometry correction using browser-compatible OpenCV
    const processedUri = await applyGeometryCorrection(imageUri, config);

    console.log("[OpenCV Bridge] Geometry correction complete (web)");

    return {
      success: true,
      processedUri,
    };
  } catch (error) {
    console.error("[OpenCV Bridge] Geometry correction failed:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * No-op for web (no setup needed)
 */
export function setOpenCVReady(): void {
  // Not needed for web - OpenCV loads on demand
}

/**
 * No-op for web (no WebView messages)
 */
export function handleOpenCVMessage(_message: unknown): void {
  // Not needed for web
}

/**
 * No-op component for web platform
 */
export function OpenCVBridgeSetup(): JSX.Element | null {
  // Web platform doesn't need a WebView
  return null;
}


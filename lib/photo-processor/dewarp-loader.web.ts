import type { DataUrl } from "@/lib/types/primitives";
import { applyGeometryCorrection } from "./pipelines/geometry";
import type { PhotoAdjustmentConfig } from "./types";

interface DewarpResult {
  success: boolean;
  processedUri?: DataUrl;
  error?: string;
}

// Web implementation: Direct browser-compatible OpenCV processing
export async function dewarpImage(
  imageUri: DataUrl,
  config: Partial<PhotoAdjustmentConfig["geometry"]>
): Promise<DewarpResult> {
  try {
    console.log("[Phase 1] Starting geometry correction (web/opencv)");

    // Apply geometry correction using browser-compatible OpenCV
    const processedUri = await applyGeometryCorrection(imageUri, config);

    console.log("[Phase 1] Geometry correction complete (web)");

    return {
      success: true,
      processedUri,
    };
  } catch (error) {
    console.error("[Phase 1] Geometry correction failed:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// No-op for web (no setup needed)
export function setDewarpReady(): void {
  // Not needed for web - OpenCV loads on demand
}

// No-op for web (no WebView messages)
export function handleDewarpMessage(_message: unknown): void {
  // Not needed for web
}

import type { DataUrl } from "@/lib/types/primitives";
import type { PhotoAdjustmentConfig } from "../types";

/**
 * Message types for WebView bridge communication (native only)
 */
export interface GeometryProcessingMessage {
  type: "geometry" | "ready" | "result" | "error" | "log";
  id?: string;
  imageData?: DataUrl;
  config?: Partial<PhotoAdjustmentConfig["geometry"]>;
  result?: DataUrl;
  error?: string;
  message?: string;
}

/**
 * Result from geometry processing
 */
export interface GeometryProcessingResult {
  success: boolean;
  processedUri?: DataUrl;
  error?: string;
}


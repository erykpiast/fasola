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
 * Message types for lighting processing
 */
export interface LightingProcessingMessage {
  type: "lighting" | "ready" | "result" | "error" | "log";
  id?: string;
  imageData?: DataUrl;
  config?: Partial<PhotoAdjustmentConfig["lighting"]>;
  result?: DataUrl;
  error?: string;
  message?: string;
}

/**
 * Union type for all processing messages
 */
export type ProcessingMessage =
  | GeometryProcessingMessage
  | LightingProcessingMessage;

/**
 * Result from geometry processing
 */
export interface GeometryProcessingResult {
  success: boolean;
  processedUri?: DataUrl;
  error?: string;
}

/**
 * Result from lighting processing
 */
export interface LightingProcessingResult {
  success: boolean;
  processedUri?: DataUrl;
  error?: string;
}

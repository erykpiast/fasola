/**
 * Shared type definitions and exports for OpenCV loader.
 * Re-exports platform-specific implementations.
 */

import type { DataUrl, PhotoUri } from "@/lib/types/primitives";
import type { DebugVisualizationData } from "./types";

/**
 * Geometry correction operation.
 */
export interface GeometryOperation {
  type: "geometry";
  config: {
    minPageArea: number;
    padding: number;
  };
  debug?: boolean;
}

/**
 * Passthrough operation (no processing).
 */
export interface PassthroughOperation {
  type: "passthrough";
}

/**
 * All supported image operations.
 */
export type ImageOperation = GeometryOperation | PassthroughOperation;

/**
 * Result of image processing with optional debug data.
 */
export interface ProcessImageResult {
  dataUrl: DataUrl;
  debug?: DebugVisualizationData;
}

/**
 * Platform-agnostic OpenCV instance interface.
 */
export interface OpenCVInstance {
  processImage(
    imageUri: PhotoUri,
    operations: Array<ImageOperation>
  ): Promise<ProcessImageResult>;
}

/**
 * WebView bridge for native platforms.
 * Manages communication between React Native and WebView.
 */
export interface OpenCVWebViewBridge {
  setWebViewRef(ref: unknown): void;
  handleMessage(event: { nativeEvent: { data: string } }): void;
  waitForReady(): Promise<void>;
  processImage(
    imageUri: PhotoUri,
    operations: Array<ImageOperation>
  ): Promise<ProcessImageResult>;
}

/**
 * Load and initialize OpenCV.js library.
 * Returns cached instance on subsequent calls.
 */
export declare function loadOpenCV(): Promise<OpenCVInstance>;

/**
 * Check if OpenCV.js is currently loaded.
 */
export declare function isOpenCVLoaded(): boolean;

/**
 * Get the current OpenCV instance without loading.
 * Returns null if not loaded.
 */
export declare function getOpenCVInstance(): OpenCVInstance | null;

/**
 * Get the WebView bridge instance.
 * Only available on native platforms; throws on web.
 */
export declare function getWebViewBridge(): OpenCVWebViewBridge;

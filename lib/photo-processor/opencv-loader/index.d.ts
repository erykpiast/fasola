/**
 * Type declarations for OpenCV loader.
 * Metro will automatically resolve to the correct platform-specific implementation.
 */

export type {
  GeometryOperation,
  ImageOperation,
  OpenCVInstance,
  OpenCVWebViewBridge,
  PassthroughOperation,
} from "@/lib/photo-processor/opencv-loader.d";

export function loadOpenCV(): Promise<void>;
export function isOpenCVLoaded(): boolean;
export function getOpenCVInstance(): Promise<any>;
export function getWebViewBridge(): any;

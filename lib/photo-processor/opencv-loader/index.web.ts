/**
 * Platform-agnostic OpenCV loader - Web platform.
 * Automatically uses web implementation with direct OpenCV.js integration.
 */

export type {
  GeometryOperation,
  ImageOperation,
  OpenCVInstance,
  OpenCVWebViewBridge,
  PassthroughOperation,
} from "@/lib/photo-processor/opencv-loader.d";

export {
  getOpenCVInstance,
  getWebViewBridge,
  isOpenCVLoaded,
  loadOpenCV,
} from "@/lib/photo-processor/opencv-loader.web";

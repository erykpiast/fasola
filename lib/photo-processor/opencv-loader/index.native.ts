/**
 * Platform-agnostic OpenCV loader - Native platform.
 * Automatically uses native implementation via WebView.
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
} from "@/lib/photo-processor/opencv-loader.native";

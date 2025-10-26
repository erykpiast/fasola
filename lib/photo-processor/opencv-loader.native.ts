/**
 * OpenCV.js loader for React Native.
 * Uses WebView to run OpenCV.js processing.
 */

import type { DataUrl, PhotoUri } from "@/lib/types/primitives";
import { File } from "expo-file-system";
import type WebView from "react-native-webview";
import type { ImageOperation, OpenCVInstance, ProcessImageResult } from "./opencv-loader.d";
import type { DebugVisualizationData } from "./types";

/**
 * WebView message types for OpenCV bridge.
 */
type WebViewMessage =
  | { type: "opencv-ready" }
  | {
      type: "process-result";
      requestId: string;
      success: boolean;
      processedUri?: DataUrl;
      debug?: DebugVisualizationData;
      error?: string;
    };

/**
 * Convert a file URI to a data URL by reading the file as base64.
 */
async function fileUriToDataUrl(uri: PhotoUri): Promise<DataUrl> {
  try {
    const file = new File(uri);
    const base64 = await file.base64();
    return `data:image/jpeg;base64,${base64}` as DataUrl;
  } catch (error) {
    throw new Error(
      `Failed to read image file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Singleton WebView instance for OpenCV processing.
 */
class OpenCVWebViewBridge {
  private webViewRef: WebView | null = null;
  private isReady = false;
  private readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private pendingRequests = new Map<
    string,
    {
      resolve: (result: ProcessImageResult) => void;
      reject: (error: Error) => void;
    }
  >();

  constructor() {
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  /**
   * Set the WebView reference (called by the WebView component).
   */
  setWebViewRef(ref: WebView | null): void {
    this.webViewRef = ref;
  }

  /**
   * Handle messages from the WebView.
   */
  handleMessage(event: { nativeEvent: { data: string } }): void {
    try {
      const message: WebViewMessage = JSON.parse(event.nativeEvent.data);

      if (message.type === "opencv-ready") {
        this.isReady = true;
        this.resolveReady();
        console.log("[OpenCV Native] WebView bridge ready");
      } else if (message.type === "process-result") {
        const pending = this.pendingRequests.get(message.requestId);
        if (pending) {
          this.pendingRequests.delete(message.requestId);
          if (message.success && message.processedUri) {
            pending.resolve({
              dataUrl: message.processedUri,
              debug: message.debug,
            });
          } else {
            pending.reject(new Error(message.error || "Processing failed"));
          }
        }
      }
    } catch (error) {
      console.error("[OpenCV Native] Error handling message:", error);
    }
  }

  /**
   * Wait for the WebView to be ready.
   */
  async waitForReady(): Promise<void> {
    await this.readyPromise;
  }

  /**
   * Process an image through the WebView bridge.
   */
  async processImage(
    imageUri: PhotoUri,
    operations: Array<ImageOperation>
  ): Promise<ProcessImageResult> {
    await this.waitForReady();

    if (!this.webViewRef) {
      throw new Error("WebView not initialized");
    }

    const imageDataUrl = await fileUriToDataUrl(imageUri);

    const requestId = Math.random().toString(36).substring(7);

    const result = await new Promise<ProcessImageResult>((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });

      const message = JSON.stringify({
        type: "process-image",
        requestId,
        imageUri: imageDataUrl,
        operations,
      });

      this.webViewRef?.postMessage(message);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error("Processing timeout"));
        }
      }, 30000);
    });

    return result;
  }
}

// Singleton instance
const bridge = new OpenCVWebViewBridge();

/**
 * Get the WebView bridge instance for setting up the WebView component.
 */
export function getWebViewBridge(): OpenCVWebViewBridge {
  return bridge;
}

/**
 * Load and initialize OpenCV.js library.
 * For native platforms, this returns a bridge that uses WebView internally.
 */
export async function loadOpenCV(): Promise<OpenCVInstance> {
  await bridge.waitForReady();

  return {
    processImage(imageUri: PhotoUri, operations: Array<ImageOperation>) {
      return bridge.processImage(imageUri, operations);
    },
  };
}

/**
 * Check if OpenCV.js is currently loaded.
 */
export function isOpenCVLoaded(): boolean {
  return bridge["isReady"];
}

/**
 * Get the current OpenCV instance without loading.
 * Returns null if not loaded.
 */
export function getOpenCVInstance(): OpenCVInstance | null {
  if (!bridge["isReady"]) {
    return null;
  }

  return {
    processImage(imageUri: PhotoUri, operations: Array<ImageOperation>) {
      return bridge.processImage(imageUri, operations);
    },
  };
}

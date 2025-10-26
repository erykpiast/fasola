/**
 * OpenCV WebView Bridge Script
 * This script runs inside a WebView and handles OpenCV processing for React Native.
 * It communicates with the native side via postMessage.
 *
 * This file will be bundled with all its dependencies before being inlined into the WebView.
 */

import type { Mat } from "@techstark/opencv-js";
import type { ImageOperation } from "./opencv-loader.d";
import {
  applyGeometryCorrection,
  loadImageToMat,
  matToDataUrl,
} from "./pipelines/opencv-core";

interface OpenCVGlobal {
  onRuntimeInitialized?: () => void;
  Mat: new () => Mat;
  matFromImageData: (imageData: ImageData) => Mat;
  cvtColor: (src: Mat, dst: Mat, code: number) => void;
  Canny: (src: Mat, dst: Mat, threshold1: number, threshold2: number) => void;
  imshow: (canvas: HTMLCanvasElement, mat: Mat) => void;
  COLOR_RGBA2GRAY: number;
}

declare const cv: OpenCVGlobal;
declare const window: Window & {
  ReactNativeWebView?: {
    postMessage(message: string): void;
  };
};

let cvReady = false;

/**
 * Forward console messages to React Native for better debugging.
 */
function forwardConsoleToNative(): void {
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  console.log = (...args: Array<unknown>) => {
    originalConsole.log(...args);
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "console",
          level: "log",
          message: args.map((arg) => String(arg)).join(" "),
        })
      );
    }
  };

  console.warn = (...args: Array<unknown>) => {
    originalConsole.warn(...args);
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "console",
          level: "warn",
          message: args.map((arg) => String(arg)).join(" "),
        })
      );
    }
  };

  console.error = (...args: Array<unknown>) => {
    originalConsole.error(...args);
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "console",
          level: "error",
          message: args.map((arg) => String(arg)).join(" "),
        })
      );
    }
  };
}

// Set up console forwarding
forwardConsoleToNative();

/**
 * Called when OpenCV.js is fully loaded and initialized.
 */
function onOpenCvReady(): void {
  cvReady = true;
  console.log("[OpenCV WebView] OpenCV.js loaded successfully");

  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        type: "opencv-ready",
      })
    );
  }
}

// Set the callback for OpenCV initialization
if (typeof cv !== "undefined") {
  cv.onRuntimeInitialized = onOpenCvReady;
}

/**
 * Message handler for processing requests from React Native.
 */
window.addEventListener("message", function (event) {
  let message: {
    type: string;
    imageUri: string;
    operations: Array<ImageOperation>;
    requestId: string;
  } | null = null;
  try {
    message = JSON.parse(event.data);

    if (message === null) {
      console.error("[OpenCV WebView] Message is null");
      return;
    }

    if (message.type === "process-image") {
      processImage(message.imageUri, message.operations, message.requestId);
    }
  } catch (error) {
    console.error("[OpenCV WebView] Error handling message:", error);
    if (message && message.requestId) {
      sendError(message.requestId, (error as Error).message);
    }
  }
});

/**
 * Process an image with OpenCV operations.
 */
async function processImage(
  imageUri: string,
  operations: Array<ImageOperation>,
  requestId: string
): Promise<void> {
  if (!cvReady) {
    sendError(requestId, "OpenCV not ready");
    return;
  }

  let src = null;
  let processedMat = null;

  try {
    console.log(
      "[OpenCV WebView] Processing image with",
      operations.length,
      "operations"
    );

    // Load image into OpenCV Mat using shared function
    src = await loadImageToMat(cv, imageUri);
    processedMat = src;

    let debugData = undefined;

    // Apply operations sequentially
    for (const operation of operations) {
      if (operation.type === "passthrough") {
        continue;
      } else if (operation.type === "geometry") {
        // Use shared geometry correction function
        const { mat: result, debug } = applyGeometryCorrection(
          cv,
          processedMat,
          operation.debug
        );
        if (result) {
          if (processedMat !== src) {
            processedMat.delete();
          }
          processedMat = result;
        }
        if (debug) {
          debugData = debug;
        }
      }
    }

    // Convert result to data URL using shared function
    const processedUri = matToDataUrl(cv, processedMat);
    sendResult(requestId, processedUri, debugData);
  } catch (error) {
    console.error("[OpenCV WebView] Processing error:", error);
    debugger;
    sendError(requestId, (error as Error).message);
  } finally {
    if (src) {
      src.delete();
    }
    if (processedMat && processedMat !== src) {
      processedMat.delete();
    }
  }
}

/**
 * Send successful result back to React Native.
 */
function sendResult(requestId: string, processedUri: string, debugData?: any): void {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        type: "process-result",
        requestId: requestId,
        success: true,
        processedUri: processedUri,
        debug: debugData,
      })
    );
  }
}

/**
 * Send error back to React Native.
 */
function sendError(requestId: string, errorMessage: string): void {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        type: "process-result",
        requestId: requestId,
        success: false,
        error: errorMessage,
      })
    );
  }
}

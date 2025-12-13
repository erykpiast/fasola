// WebView bridge for opencv.js dewarping
// This code runs inside the WebView and communicates with React Native via postMessage

import type { DataUrl } from "@/lib/types/primitives";
import { processDewarp, type DewarpConfig } from "./pipelines";
import type { DewarpMessage } from "./types";

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
    cv?: any;
    handleOpenCVLoadError?: () => void;
    initDewarp?: () => void;
  }
}

(function () {
  "use strict";

  // Override console.log to forward all logs to React Native
  const originalConsoleLog = console.log;
  console.log = function (...args: Array<any>): void {
    // Call original console.log
    originalConsoleLog.apply(console, args);

    // Forward to React Native
    if (window.ReactNativeWebView) {
      const logMessage = args
        .map((arg) => {
          if (typeof arg === "object") {
            try {
              return JSON.stringify(arg);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        })
        .join(" ");

      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "log",
          message: "[Bridge] " + logMessage,
        })
      );
    }
  };

  console.log("Starting bridge initialization");

  let cv: any = null;
  let isReady = false;

  // Handle OpenCV load error
  window.handleOpenCVLoadError = function (): void {
    console.log("Failed to load opencv.js from CDN");
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "error",
          error: "Failed to load opencv.js from CDN",
        })
      );
    }
  };

  // Initialize when opencv.js loads
  window.initDewarp = function (): void {
    console.log("OpenCV script loaded, initializing");

    // OpenCV.js may not be immediately ready even after script loads
    // We need to wait for cv.onRuntimeInitialized
    if (window.cv && typeof window.cv !== "function") {
      console.log("cv object available, waiting for runtime initialization");
      cv = window.cv;

      cv["onRuntimeInitialized"] = function (): void {
        try {
          console.log("OpenCV runtime initialized");

          if (!cv.Mat) {
            throw new Error("OpenCV Mat not available");
          }

          // Delete the 'then' method to avoid promise issues
          delete cv.then;

          isReady = true;
          console.log("OpenCV ready");

          // Notify React Native that we're ready
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(
              JSON.stringify({
                type: "ready",
              })
            );
          }
        } catch (error) {
          const err = error as Error;
          console.log("Runtime initialization error: " + err.message);
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(
              JSON.stringify({
                type: "error",
                error: "OpenCV runtime init failed: " + err.message,
              })
            );
          }
        }
      };
    } else {
      console.log("cv not available or is a function");
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: "error",
            error: "OpenCV not available after script load",
          })
        );
      }
    }
  };

  // Process dewarp request
  async function processDewarpRequest(
    id: string,
    imageDataUrl: DataUrl,
    config: DewarpConfig
  ): Promise<void> {
    try {
      if (!isReady || !cv) {
        throw new Error("OpenCV not initialized");
      }

      console.log("Processing image");

      const result = await processDewarp(cv, imageDataUrl, config);

      // Send result back to React Native
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: "result",
            id: id,
            result: result,
          })
        );
      }

      console.log("Image processed successfully");
    } catch (error) {
      const err = error as Error;
      console.log("Processing error: " + err.message);
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: "error",
            id: id,
            error: err.message,
          })
        );
      }
    }
  }

  // Handle messages from React Native
  window.addEventListener("message", function (event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data) as DewarpMessage;

      if (message.type === "dewarp") {
        processDewarpRequest(
          message.id!,
          message.imageData!,
          message.config || {}
        );
      }
    } catch (error) {
      const err = error as Error;
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: "error",
            error: "Invalid message: " + err.message,
          })
        );
      }
    }
  });

  console.log("Bridge script loaded, waiting for OpenCV");
})();

/**
 * OpenCV WebView Bridge Script
 * This script runs inside a WebView and handles OpenCV processing for React Native.
 * It communicates with the native side via postMessage.
 */

/** @type {boolean} */
let cvReady = false;

/**
 * Called when OpenCV.js is fully loaded and initialized.
 */
function onOpenCvReady() {
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
  try {
    const message = JSON.parse(event.data);

    if (message.type === "process-image") {
      processImage(message.imageUri, message.operations, message.requestId);
    }
  } catch (error) {
    console.error("[OpenCV WebView] Error handling message:", error);
    if (message && message.requestId) {
      sendError(message.requestId, error.message);
    }
  }
});

/**
 * Process an image with OpenCV operations.
 * @param {string} imageUri - The URI of the image to process
 * @param {Array<Object>} operations - Array of processing operations to apply
 * @param {string} requestId - Unique ID for this processing request
 */
async function processImage(imageUri, operations, requestId) {
  if (!cvReady) {
    sendError(requestId, "OpenCV not ready");
    return;
  }

  try {
    console.log(
      "[OpenCV WebView] Processing image with",
      operations.length,
      "operations"
    );

    // Phase 0: Just return the original image URI
    // Actual processing will be implemented in future phases
    sendResult(requestId, imageUri);
  } catch (error) {
    console.error("[OpenCV WebView] Processing error:", error);
    sendError(requestId, error.message);
  }
}

/**
 * Send successful result back to React Native.
 * @param {string} requestId - The request ID
 * @param {string} processedUri - The processed image URI
 */
function sendResult(requestId, processedUri) {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        type: "process-result",
        requestId: requestId,
        success: true,
        processedUri: processedUri,
      })
    );
  }
}

/**
 * Send error back to React Native.
 * @param {string} requestId - The request ID
 * @param {string} errorMessage - The error message
 */
function sendError(requestId, errorMessage) {
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

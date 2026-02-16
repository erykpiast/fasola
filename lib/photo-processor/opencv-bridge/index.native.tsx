import type { DataUrl } from "@/lib/types/primitives";
import { useEffect, useRef, type JSX } from "react";
import { StyleSheet, View } from "react-native";
import type { WebViewMessageEvent } from "react-native-webview";
import WebView from "react-native-webview";
import type { PhotoAdjustmentConfig } from "../types";
import type {
  ClarityProcessingResult,
  GeometryProcessingResult,
  LightingProcessingResult,
  ProcessingMessage,
} from "./types";

// Import bridge code as raw string (thanks to metro-workers-transformer.js)
// @ts-expect-error - Metro transformer bundles this TypeScript file and exports it as a string
import bridgeCode from "./webview-bridge";

interface OpenCVBridgeSetupProps {
  onReady?: () => void;
  onMessage?: (message: ProcessingMessage) => void;
}

// Global reference to the WebView for sending messages
let webViewRef: WebView | null = null;

// State management for WebView communication
let isWebViewReady = false;
const pendingGeometryRequests = new Map<
  string,
  {
    resolve: (result: GeometryProcessingResult) => void;
    reject: (error: Error) => void;
  }
>();
const pendingLightingRequests = new Map<
  string,
  {
    resolve: (result: LightingProcessingResult) => void;
    reject: (error: Error) => void;
  }
>();
const pendingClarityRequests = new Map<
  string,
  {
    resolve: (result: ClarityProcessingResult) => void;
    reject: (error: Error) => void;
  }
>();

// Send message to WebView
function sendToWebView(message: ProcessingMessage): void {
  if (webViewRef) {
    webViewRef.postMessage(JSON.stringify(message));
  }
}

/**
 * Called when WebView is ready
 */
export function setOpenCVReady(): void {
  isWebViewReady = true;
  console.log("[OpenCV Bridge] Native WebView ready");
}

/**
 * Handle messages from WebView
 */
export function handleOpenCVMessage(message: ProcessingMessage): void {
  if (message.type === "result" && message.id) {
    // Check if it's a geometry request
    const geometryPending = pendingGeometryRequests.get(message.id);
    if (geometryPending && message.result) {
      geometryPending.resolve({
        success: true,
        processedUri: message.result as DataUrl,
      });
      pendingGeometryRequests.delete(message.id);
      return;
    }

    // Check if it's a lighting request
    const lightingPending = pendingLightingRequests.get(message.id);
    if (lightingPending && message.result) {
      lightingPending.resolve({
        success: true,
        processedUri: message.result as DataUrl,
        grayscaleUri: (message as { grayscaleResult?: DataUrl }).grayscaleResult,
      });
      pendingLightingRequests.delete(message.id);
      return;
    }

    // Check if it's a clarity request
    const clarityPending = pendingClarityRequests.get(message.id);
    if (clarityPending && message.result) {
      clarityPending.resolve({
        success: true,
        processedUri: message.result as DataUrl,
      });
      pendingClarityRequests.delete(message.id);
      return;
    }
  } else if (message.type === "error" && message.id) {
    // Check if it's a geometry request
    const geometryPending = pendingGeometryRequests.get(message.id);
    if (geometryPending) {
      geometryPending.resolve({
        success: false,
        error: message.error || "Unknown error",
      });
      pendingGeometryRequests.delete(message.id);
      return;
    }

    // Check if it's a lighting request
    const lightingPending = pendingLightingRequests.get(message.id);
    if (lightingPending) {
      lightingPending.resolve({
        success: false,
        error: message.error || "Unknown error",
      });
      pendingLightingRequests.delete(message.id);
      return;
    }

    // Check if it's a clarity request
    const clarityPending = pendingClarityRequests.get(message.id);
    if (clarityPending) {
      clarityPending.resolve({
        success: false,
        error: message.error || "Unknown error",
      });
      pendingClarityRequests.delete(message.id);
      return;
    }
  }
}

/**
 * Process image via WebView bridge (geometry correction)
 */
export async function processGeometry(
  imageUri: DataUrl,
  config: Partial<PhotoAdjustmentConfig["geometry"]>
): Promise<GeometryProcessingResult> {
  console.log("[OpenCV Bridge] Starting geometry correction (native)");

  if (!isWebViewReady) {
    console.warn("[OpenCV Bridge] WebView not ready, skipping processing");
    return {
      success: false,
      error: "WebView not initialized",
    };
  }

  return new Promise<GeometryProcessingResult>((resolve, reject) => {
    const id = `geometry_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Register pending request
    pendingGeometryRequests.set(id, { resolve, reject });

    // Send message to WebView
    const message: ProcessingMessage = {
      type: "geometry",
      id,
      imageData: imageUri,
      config,
    };

    sendToWebView(message);

    // Set timeout to prevent hanging
    setTimeout(() => {
      if (pendingGeometryRequests.has(id)) {
        pendingGeometryRequests.delete(id);
        resolve({
          success: false,
          error: "Processing timeout",
        });
      }
    }, 30000); // 30 second timeout
  });
}

/**
 * Process image via WebView bridge (lighting correction)
 */
export async function processLighting(
  imageUri: DataUrl,
  config: Partial<PhotoAdjustmentConfig["lighting"]>
): Promise<LightingProcessingResult> {
  console.log("[OpenCV Bridge] Starting lighting correction (native)");

  if (!isWebViewReady) {
    console.warn("[OpenCV Bridge] WebView not ready, skipping processing");
    return {
      success: false,
      error: "WebView not initialized",
    };
  }

  return new Promise<LightingProcessingResult>((resolve, reject) => {
    const id = `lighting_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Register pending request
    pendingLightingRequests.set(id, { resolve, reject });

    // Send message to WebView
    const message: ProcessingMessage = {
      type: "lighting",
      id,
      imageData: imageUri,
      config,
    };

    sendToWebView(message);

    // Set timeout to prevent hanging
    setTimeout(() => {
      if (pendingLightingRequests.has(id)) {
        pendingLightingRequests.delete(id);
        resolve({
          success: false,
          error: "Processing timeout",
        });
      }
    }, 30000); // 30 second timeout
  });
}

/**
 * Process image via WebView bridge (clarity enhancement)
 */
export async function processClarity(
  imageUri: DataUrl,
  config: Partial<PhotoAdjustmentConfig["clarity"]>
): Promise<ClarityProcessingResult> {
  console.log("[OpenCV Bridge] Starting clarity enhancement (native)");

  if (!isWebViewReady) {
    console.warn("[OpenCV Bridge] WebView not ready, skipping processing");
    return {
      success: false,
      error: "WebView not initialized",
    };
  }

  return new Promise<ClarityProcessingResult>((resolve, reject) => {
    const id = `clarity_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Register pending request
    pendingClarityRequests.set(id, { resolve, reject });

    // Send message to WebView
    const message: ProcessingMessage = {
      type: "clarity",
      id,
      imageData: imageUri,
      config,
    };

    sendToWebView(message);

    // Set timeout to prevent hanging
    setTimeout(() => {
      if (pendingClarityRequests.has(id)) {
        pendingClarityRequests.delete(id);
        resolve({
          success: false,
          error: "Processing timeout",
        });
      }
    }, 30000); // 30 second timeout
  });
}

/**
 * Hidden WebView component that enables OpenCV processing
 */
export function OpenCVBridgeSetup(props: OpenCVBridgeSetupProps): JSX.Element {
  const { onReady, onMessage } = props;
  const localWebViewRef = useRef<WebView>(null);

  useEffect(() => {
    webViewRef = localWebViewRef.current;
    return () => {
      webViewRef = null;
    };
  }, []);

  const handleMessage = (event: WebViewMessageEvent): void => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as ProcessingMessage;

      if (message.type === "log") {
        // Forward WebView logs to React Native console
        console.log(message.message);
      } else if (message.type === "ready") {
        onReady?.();
      } else if (onMessage) {
        onMessage(message);
      }
    } catch (error) {
      console.error("Failed to parse WebView message:", error);
    }
  };

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>OpenCV WebView</title>
      </head>
      <body>
        <script>
          ${bridgeCode}
        </script>
        <script async src="https://docs.opencv.org/4.5.2/opencv.js" onload="initOpenCV()" onerror="handleOpenCVLoadError()"></script>
      </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <WebView
        ref={localWebViewRef}
        source={{ html }}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        originWhitelist={["*"]}
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        mixedContentMode="always"
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    zIndex: -1000,
    pointerEvents: "none",
  },
  webview: {
    width: 100,
    height: 100,
    opacity: 0.01,
  },
});

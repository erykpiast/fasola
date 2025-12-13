import type { DataUrl } from "@/lib/types/primitives";
import { useEffect, useRef, type JSX } from "react";
import { StyleSheet, View } from "react-native";
import type { WebViewMessageEvent } from "react-native-webview";
import WebView from "react-native-webview";
import type { PhotoAdjustmentConfig } from "../types";
import type {
  GeometryProcessingMessage,
  GeometryProcessingResult,
} from "./types";

// Import bridge code as raw string (thanks to metro-workers-transformer.js)
// @ts-expect-error - Metro transformer bundles this TypeScript file and exports it as a string
import bridgeCode from "./webview-bridge";

interface OpenCVBridgeSetupProps {
  onReady?: () => void;
  onMessage?: (message: GeometryProcessingMessage) => void;
}

// Global reference to the WebView for sending messages
let webViewRef: WebView | null = null;

// State management for WebView communication
let isWebViewReady = false;
const pendingRequests = new Map<
  string,
  {
    resolve: (result: GeometryProcessingResult) => void;
    reject: (error: Error) => void;
  }
>();

// Send message to WebView
function sendToWebView(message: GeometryProcessingMessage): void {
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
export function handleOpenCVMessage(message: GeometryProcessingMessage): void {
  if (message.type === "result" && message.id) {
    const pending = pendingRequests.get(message.id);
    if (pending && message.result) {
      pending.resolve({
        success: true,
        processedUri: message.result as DataUrl,
      });
      pendingRequests.delete(message.id);
    }
  } else if (message.type === "error" && message.id) {
    const pending = pendingRequests.get(message.id);
    if (pending) {
      pending.resolve({
        success: false,
        error: message.error || "Unknown error",
      });
      pendingRequests.delete(message.id);
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
    pendingRequests.set(id, { resolve, reject });

    // Send message to WebView
    const message: GeometryProcessingMessage = {
      type: "geometry",
      id,
      imageData: imageUri,
      config,
    };

    sendToWebView(message);

    // Set timeout to prevent hanging
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
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
      const message = JSON.parse(
        event.nativeEvent.data
      ) as GeometryProcessingMessage;

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

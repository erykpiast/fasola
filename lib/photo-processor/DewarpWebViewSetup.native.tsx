import { useEffect, useRef, type JSX } from "react";
import { StyleSheet, View } from "react-native";
import type { WebViewMessageEvent } from "react-native-webview";
import WebView from "react-native-webview";
import type { DewarpMessage } from "./types";

// Import bridge code as raw string (thanks to metro-raw-loader-transformer.js)
// @ts-expect-error - Metro transformer bundles this TypeScript file and exports it as a string
import bridgeCode from "./dewarp-webview-bridge";

interface DewarpWebViewSetupProps {
  onReady?: () => void;
  onMessage?: (message: DewarpMessage) => void;
}

// Global reference to the WebView for sending messages
let webViewRef: WebView | null = null;

// Send message to WebView
export function sendToWebView(message: DewarpMessage): void {
  if (webViewRef) {
    webViewRef.postMessage(JSON.stringify(message));
  }
}

// Hidden WebView component that runs page-dewarp-js
export function DewarpWebViewSetup(
  props: DewarpWebViewSetupProps
): JSX.Element {
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
      const message = JSON.parse(event.nativeEvent.data) as DewarpMessage;

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
        <title>Dewarp WebView</title>
      </head>
      <body>
        <script>
          ${bridgeCode}
        </script>
        <script async src="https://docs.opencv.org/4.5.2/opencv.js" onload="initDewarp()" onerror="handleOpenCVLoadError()"></script>
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

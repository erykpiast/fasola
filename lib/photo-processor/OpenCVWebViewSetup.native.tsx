/**
 * Hidden WebView component for OpenCV processing on React Native.
 * This component must be mounted in the app for OpenCV processing to work.
 */

import { type JSX, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import WebView from "react-native-webview";
import { getWebViewBridge } from "./opencv-loader";
import bridgeScript from "./opencv-webview-bridge.js";

/**
 * Generate the HTML for the WebView with the bridge script injected.
 */
function generateOpenCVHTML(): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenCV WebView Bridge</title>
  <style>
    body { margin: 0; padding: 0; }
    #canvas { display: none; }
  </style>
</head>
<body>
  <canvas id="canvas"></canvas>
  
  <script src="https://docs.opencv.org/4.x/opencv.js"></script>
  <script>
${bridgeScript}
  </script>
</body>
</html>
`;
}

/**
 * Hidden WebView component that enables OpenCV processing.
 * Must be mounted somewhere in the app (typically in the root layout).
 */
export function OpenCVWebViewSetup(): JSX.Element {
  const webViewRef = useRef<WebView>(null);
  const bridge = getWebViewBridge();
  const html = generateOpenCVHTML();

  useEffect(() => {
    if (webViewRef.current) {
      bridge.setWebViewRef(webViewRef.current);
    }

    return () => {
      bridge.setWebViewRef(null);
    };
  }, [bridge]);

  return (
    <View style={styles.hidden}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        onMessage={(event) => bridge.handleMessage(event)}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={["*"]}
        style={styles.webView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: "absolute",
    left: -10000,
    top: -10000,
    width: 1,
    height: 1,
    opacity: 0,
  },
  webView: {
    width: 1,
    height: 1,
  },
});

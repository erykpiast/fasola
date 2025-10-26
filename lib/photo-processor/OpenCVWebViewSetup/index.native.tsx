/**
 * Hidden WebView component for OpenCV processing on React Native.
 * This component must be mounted in the app for OpenCV processing to work.
 */

import { type JSX, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import WebView from "react-native-webview";
import { getWebViewBridge } from "../opencv-loader";
// Import the bundled script as a raw string
import bridgeScript from "../opencv-webview-bridge.bundle.js";

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

  const handleMessage = (event: { nativeEvent: { data: string } }): void => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      // Forward WebView console messages to React Native console
      if (message.type === "console") {
        const prefix = "[OpenCV WebView]";
        switch (message.level) {
          case "log":
            console.log(prefix, message.message);
            break;
          case "warn":
            console.warn(prefix, message.message);
            break;
          case "error":
            console.error(prefix, message.message);
            break;
        }
        return;
      }

      // Handle other messages normally
      bridge.handleMessage(event);
    } catch {
      // If parsing fails, pass to bridge as-is
      bridge.handleMessage(event);
    }
  };

  return (
    <View style={styles.hidden}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        onMessage={handleMessage}
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

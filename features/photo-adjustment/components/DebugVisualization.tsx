import { useDebugContext } from "@/features/photo-adjustment/context/DebugContext";
import { type JSX } from "react";
import { Image, StyleSheet, View } from "react-native";

/**
 * Debug visualization overlay for basic OpenCV edge detection.
 * Displays Canny edges in blue with transparency.
 */
export function DebugVisualization(props: {
  width: number;
  height: number;
}): JSX.Element | null {
  const { width, height } = props;
  const { debugData } = useDebugContext();

  if (!debugData) {
    return null;
  }

  return (
    <View style={[styles.container, { width, height }]} pointerEvents="none">
      {debugData.edges && (
        <View style={[styles.edgesContainer, { width, height }]}>
          <Image
            source={{ uri: debugData.edges }}
            style={[styles.edgesOverlay, { width, height }]}
            resizeMode="cover"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  edgesContainer: {
    position: "absolute",
    backgroundColor: "rgba(0, 0, 255, 0.3)",
  },
  edgesOverlay: {
    position: "absolute",
    opacity: 0.7,
  },
});

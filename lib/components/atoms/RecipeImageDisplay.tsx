import { DebugVisualization } from "@/features/photo-adjustment/components/DebugVisualization";
import type { ImageUri } from "@/lib/types/primitives";
import { Image, type ImageContentFit } from "expo-image";
import { type JSX } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

export function RecipeImageDisplay({
  uri,
  style,
  contentFit = "cover",
}: {
  uri: ImageUri;
  style?: ViewStyle;
  contentFit?: ImageContentFit;
}): JSX.Element {
  // Defensive check: ensure uri is a non-empty string
  const validUri = uri && typeof uri === "string" ? uri : "";

  return (
    <View style={[styles.container, style]}>
      <Image
        source={{ uri: validUri }}
        style={styles.image}
        contentFit={contentFit}
      />
      <DebugVisualization />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
});

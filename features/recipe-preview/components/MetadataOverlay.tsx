import type { RecipeMetadata } from "@/lib/types/recipe";
import { LinearGradient } from "expo-linear-gradient";
import { type JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

export function MetadataOverlay({
  metadata,
}: {
  metadata: RecipeMetadata;
}): JSX.Element | null {
  const hasTitle = !!metadata.title;
  const hasSource = !!metadata.source;
  const hasTags = metadata.tags && metadata.tags.length > 0;

  if (!hasTitle && !hasSource && !hasTags) {
    return null;
  }

  return (
    <LinearGradient
      colors={["rgba(0,0,0,0.6)", "transparent"]}
      locations={[0, 1]}
      style={styles.gradient}
    >
      {hasTitle && (
        <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
          {metadata.title}
        </Text>
      )}
      {hasSource && (
        <Text style={styles.source} numberOfLines={1} ellipsizeMode="tail">
          {metadata.source}
        </Text>
      )}
      {hasTags && (
        <View style={styles.tagsContainer}>
          <Text style={styles.tags} numberOfLines={1} ellipsizeMode="tail">
            {metadata.tags.join("  ")}
          </Text>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 80,
  },
  title: {
    color: "white",
    fontSize: 24,
    fontWeight: "bold",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    marginBottom: 4,
  },
  source: {
    color: "white",
    fontSize: 14,
    fontStyle: "italic",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    marginBottom: 8,
  },
  tagsContainer: {
    flexDirection: "row",
  },
  tags: {
    color: "white",
    fontSize: 14,
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

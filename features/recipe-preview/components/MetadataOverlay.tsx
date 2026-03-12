import { SkeletonBlock } from "@/lib/components/atoms/SkeletonBlock";
import { useSourceName } from "@/features/sources/hooks/useSourceName";
import { useLocalizedTagLabels } from "@/features/tags/hooks/useLocalizedTagLabels";
import type { RecipeMetadata } from "@/lib/types/recipe";
import { LinearGradient } from "expo-linear-gradient";
import { type JSX } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function MetadataOverlay({
  metadata,
  isProcessing,
  onPress,
  disabled,
}: {
  metadata: RecipeMetadata;
  isProcessing?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}): JSX.Element | null {
  const { displayName: sourceDisplayName } = useSourceName(metadata.source);
  const tagLabels = useLocalizedTagLabels(metadata.tagIds);
  const hasTitle = !!metadata.title;
  const hasSource = !!sourceDisplayName;
  const hasTags = tagLabels.length > 0;

  if (!hasTitle && !hasSource && !hasTags && !isProcessing) {
    return null;
  }

  return (
    <LinearGradient
      colors={["rgba(0,0,0, 1)", "rgba(0,0,0,0.6)", "transparent"]}
      locations={[0, 0.6, 1]}
      style={styles.gradient}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={onPress}
        disabled={disabled || !onPress}
        style={({ pressed }) => [
          styles.pressable,
          { opacity: pressed ? 0.7 : 1 },
        ]}
        hitSlop={8}
      >
        {hasTitle ? (
          <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
            {metadata.title}
          </Text>
        ) : isProcessing ? (
          <SkeletonBlock width="65%" height={28} style={{ marginBottom: 4 }} />
        ) : null}
        {hasSource ? (
          <Text style={styles.source} numberOfLines={1} ellipsizeMode="tail">
            {sourceDisplayName}
          </Text>
        ) : null}
        {hasTags ? (
          <View style={styles.tagsContainer}>
            <Text style={styles.tags} numberOfLines={1} ellipsizeMode="tail">
              {tagLabels.join("  ")}
            </Text>
          </View>
        ) : isProcessing ? (
          <View style={styles.tagsContainer}>
            <SkeletonBlock width={80} height={14} />
            <SkeletonBlock width={60} height={14} style={{ marginLeft: 8 }} />
            <SkeletonBlock width={70} height={14} style={{ marginLeft: 8 }} />
            <SkeletonBlock width={90} height={14} style={{ marginLeft: 8 }} />
          </View>
        ) : null}
      </Pressable>
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
    paddingTop: 80,
    paddingBottom: 80,
  },
  pressable: {
    alignSelf: "flex-start",
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

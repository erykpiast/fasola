import { LinearGradient } from "expo-linear-gradient";
import { type JSX } from "react";
import { StyleSheet, Text, type ViewStyle } from "react-native";

export function RecipeTitleOverlay({
  title,
  style,
}: {
  title?: string;
  style?: ViewStyle;
}): JSX.Element | null {
  if (!title) {
    return null;
  }

  return (
    <LinearGradient
      colors={["transparent", "rgba(0,0,0,0.8)"]}
      locations={[0, 1]}
      style={[styles.gradient, style]}
    >
      <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
        {title}
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 128,
  },
  title: {
    color: "white",
    fontSize: 24,
    fontWeight: "600",
  },
});

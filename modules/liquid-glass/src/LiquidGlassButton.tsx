import { Ionicons } from "@expo/vector-icons";
import { type JSX } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { LiquidGlassButtonProps } from "./LiquidGlassButton.types";

const SF_SYMBOL_TO_IONICON: Record<string, string> = {
  xmark: "close",
  checkmark: "checkmark",
  plus: "add",
  "info.circle": "information-circle-outline",
  envelope: "mail-outline",
};

export function LiquidGlassButton({
  onPress,
  systemImage,
  size = 48,
  tintColor,
  style,
  accessibilityLabel,
  accessibilityRole = "button",
  fillProgress = 0,
  fillColor,
}: LiquidGlassButtonProps): JSX.Element {
  const iconName = SF_SYMBOL_TO_IONICON[systemImage] ?? systemImage;
  const resolvedFillColor = fillColor ?? tintColor ?? "#007AFF";

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      style={[styles.container, { width: size, height: size }, style]}
    >
      {fillProgress > 0 && (
        <View
          style={[
            styles.fill,
            {
              width: `${fillProgress * 100}%`,
              backgroundColor: resolvedFillColor,
            },
          ]}
        />
      )}
      <Ionicons
        name={iconName as keyof typeof Ionicons.glyphMap}
        size={size * 0.5}
        color={tintColor ?? "#007AFF"}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: "rgba(128, 128, 128, 0.15)",
    overflow: "hidden",
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
    width: "0%",
    opacity: 0.3,
  },
});

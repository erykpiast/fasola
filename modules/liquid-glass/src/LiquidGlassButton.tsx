import { Ionicons } from "@expo/vector-icons";
import { type JSX } from "react";
import { Pressable, StyleSheet } from "react-native";
import type { LiquidGlassButtonProps } from "./LiquidGlassButton.types";

const SF_SYMBOL_TO_IONICON: Record<string, string> = {
  xmark: "close",
  checkmark: "checkmark",
  plus: "add",
};

export function LiquidGlassButton({
  onPress,
  systemImage,
  size = 48,
  tintColor,
  style,
  accessibilityLabel,
  accessibilityRole = "button",
}: LiquidGlassButtonProps): JSX.Element {
  const iconName = SF_SYMBOL_TO_IONICON[systemImage] ?? systemImage;

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      style={[styles.container, { width: size, height: size }, style]}
    >
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
  },
});

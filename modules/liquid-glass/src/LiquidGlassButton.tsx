import { type JSX } from "react";
import { StyleSheet } from "react-native";
import NativeLiquidGlassButtonView from "./LiquidGlassButton.ios";
import type { LiquidGlassButtonProps } from "./LiquidGlassButton.types";

export function LiquidGlassButton({
  onPress,
  systemImage,
  size = 48,
  style,
  accessibilityLabel,
  accessibilityRole = "button",
}: LiquidGlassButtonProps): JSX.Element {
  const TAP_EXPANSION_RATIO = 2;
  const containerSize = size * TAP_EXPANSION_RATIO;

  return (
    <NativeLiquidGlassButtonView
      systemImage={systemImage}
      buttonSize={size}
      containerSize={containerSize}
      onButtonPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      style={[styles.container, { width: size, height: size }, style]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    // overflow: "hidden",
  },
});

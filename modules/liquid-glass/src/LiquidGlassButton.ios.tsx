import { requireNativeViewManager } from "expo-modules-core";
import { type JSX } from "react";
import { StyleSheet } from "react-native";
import type { LiquidGlassButtonProps } from "./LiquidGlassButton.types";

const NativeLiquidGlassButtonView = requireNativeViewManager(
  "LiquidGlass",
  "LiquidGlassButtonView"
);

export function LiquidGlassButton({
  onPress,
  systemImage,
  size = 48,
  imageScale = 1.0,
  tintColor,
  style,
  accessibilityLabel,
  accessibilityRole = "button",
  fillProgress,
  fillColor,
}: LiquidGlassButtonProps): JSX.Element {
  const TAP_EXPANSION_RATIO = 2;
  const containerSize = size * TAP_EXPANSION_RATIO;

  return (
    <NativeLiquidGlassButtonView
      systemImage={systemImage}
      buttonSize={size}
      containerSize={containerSize}
      imageScale={imageScale}
      tintColor={tintColor}
      fillColor={fillColor}
      fillProgress={fillProgress}
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

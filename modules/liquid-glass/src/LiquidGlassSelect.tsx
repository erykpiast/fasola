import { type JSX } from "react";
import { StyleSheet } from "react-native";
import NativeLiquidGlassSelectView from "./LiquidGlassSelect.ios";
import type { LiquidGlassSelectProps } from "./LiquidGlassSelect.types";

export function LiquidGlassSelect({
  value,
  placeholder,
  onPress,
  systemImage = "chevron.down",
  disabled = false,
  style,
}: LiquidGlassSelectProps): JSX.Element {
  return (
    <NativeLiquidGlassSelectView
      value={value}
      placeholder={placeholder}
      systemImage={systemImage}
      disabled={disabled}
      onSelectPress={onPress}
      style={[styles.container, style]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    // overflow: "hidden",
  },
});

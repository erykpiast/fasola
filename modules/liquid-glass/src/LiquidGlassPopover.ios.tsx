import { requireNativeViewManager } from "expo-modules-core";
import { type JSX, useCallback } from "react";
import { StyleSheet } from "react-native";
import type { LiquidGlassPopoverProps } from "./LiquidGlassPopover.types";

const NativeLiquidGlassPopoverView = requireNativeViewManager(
  "LiquidGlass",
  "LiquidGlassPopoverView"
);

export function LiquidGlassPopover({
  visible,
  options,
  onSelect,
  onDismiss,
  style,
}: LiquidGlassPopoverProps): JSX.Element | null {
  const handleOptionSelect = useCallback(
    (event: { nativeEvent: { id: string } }) => {
      onSelect(event.nativeEvent.id);
    },
    [onSelect]
  );

  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  if (!visible) {
    return null;
  }

  return (
    <NativeLiquidGlassPopoverView
      visible={visible}
      options={options}
      onOptionSelect={handleOptionSelect}
      onDismiss={handleDismiss}
      style={[styles.container, style]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
});

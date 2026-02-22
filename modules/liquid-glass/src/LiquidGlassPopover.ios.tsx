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
  buttonSize,
  style,
  anchor,
  buttonOffset,
}: LiquidGlassPopoverProps): JSX.Element {
  const handleOptionSelect = useCallback(
    (event: { nativeEvent: { id: string } }) => {
      onSelect(event.nativeEvent.id);
    },
    [onSelect]
  );

  return (
    <NativeLiquidGlassPopoverView
      visible={visible}
      options={options}
      buttonSize={buttonSize}
      anchor={anchor}
      buttonOffset={buttonOffset}
      onOptionSelect={handleOptionSelect}
      onDismiss={onDismiss}
      style={[styles.container, style]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
});

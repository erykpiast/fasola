import { requireNativeViewManager } from "expo-modules-core";
import { type JSX, useCallback } from "react";
import { StyleSheet } from "react-native";
import type { LiquidGlassInputProps } from "./LiquidGlassInput.types";

const NativeLiquidGlassInputView = requireNativeViewManager(
  "LiquidGlass",
  "LiquidGlassInputView"
);

export function LiquidGlassInput({
  value,
  onChangeText,
  placeholder = "",
  label,
  leadingSystemImage,
  showClearButton = false,
  onClear,
  onFocus,
  onBlur,
  variant = "form",
  autoFocus = false,
  style,
}: LiquidGlassInputProps): JSX.Element {
  const handleChangeText = useCallback(
    (event: { nativeEvent: { text: string } }) => {
      onChangeText(event.nativeEvent.text);
    },
    [onChangeText]
  );

  const handleClear = useCallback(() => {
    onClear?.();
  }, [onClear]);

  const handleFocus = useCallback(() => {
    onFocus?.();
  }, [onFocus]);

  const handleBlur = useCallback(() => {
    onBlur?.();
  }, [onBlur]);

  const height = variant === "search" ? 48 : label ? 76 : 56;

  return (
    <NativeLiquidGlassInputView
      value={value}
      label={label}
      placeholder={placeholder}
      leadingSystemImage={leadingSystemImage}
      showClearButton={showClearButton}
      variant={variant}
      autoFocus={autoFocus}
      onChangeText={handleChangeText}
      onClear={handleClear}
      onInputFocus={handleFocus}
      onInputBlur={handleBlur}
      style={[styles.container, { height }, style]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    // overflow: "visible",
  },
});

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
  variant = "text",
  selectedTags = [],
  onTagPress,
  returnKeyType = "done",
  onSubmitEditing,
  blurOnSubmit = true,
  autoFocus = false,
  isFocused,
  style,
  maxLength,
}: LiquidGlassInputProps): JSX.Element {
  const handleChangeText = useCallback(
    (event: { nativeEvent: { text: string } }) => {
      const text = event.nativeEvent.text;
      if (maxLength != null && text.length > maxLength) {
        onChangeText(text.slice(0, maxLength));
        return;
      }
      onChangeText(text);
    },
    [onChangeText, maxLength]
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

  const handleTagPress = useCallback(
    (event: { nativeEvent: { id: string } }) => {
      onTagPress?.(event.nativeEvent.id);
    },
    [onTagPress]
  );

  const handleSubmitEditing = useCallback((): void => {
    onSubmitEditing?.();
  }, [onSubmitEditing]);

  const height = label ? 76 : variant === "mixed" || variant === "tags" ? 48 : 56;

  return (
    <NativeLiquidGlassInputView
      value={value}
      label={label}
      placeholder={placeholder}
      leadingSystemImage={leadingSystemImage}
      showClearButton={showClearButton}
      variant={variant}
      selectedTags={selectedTags}
      autoFocus={autoFocus}
      isFocused={isFocused}
      returnKeyType={returnKeyType}
      blurOnSubmit={blurOnSubmit}
      onChangeText={handleChangeText}
      onClear={handleClear}
      onTagPress={handleTagPress}
      onInputSubmit={handleSubmitEditing}
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

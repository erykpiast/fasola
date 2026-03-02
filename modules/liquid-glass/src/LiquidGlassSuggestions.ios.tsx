import { requireNativeViewManager } from "expo-modules-core";
import { type JSX, useCallback } from "react";
import { StyleSheet } from "react-native";
import type { LiquidGlassSuggestionsProps } from "./LiquidGlassSuggestions.types";

const NativeLiquidGlassSuggestionsView = requireNativeViewManager(
  "LiquidGlass",
  "LiquidGlassSuggestionsView"
);

export function LiquidGlassSuggestions({
  visible,
  suggestions,
  onSuggestionPress,
  style,
}: LiquidGlassSuggestionsProps): JSX.Element {
  const handleSuggestionPress = useCallback(
    (event: { nativeEvent: { id: string } }): void => {
      onSuggestionPress(event.nativeEvent.id);
    },
    [onSuggestionPress]
  );

  return (
    <NativeLiquidGlassSuggestionsView
      visible={visible}
      suggestions={suggestions}
      onSuggestionPress={handleSuggestionPress}
      style={[styles.container, style]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "flex-start",
  },
});

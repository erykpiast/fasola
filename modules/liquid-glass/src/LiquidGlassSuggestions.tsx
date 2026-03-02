import { type JSX } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LiquidGlassSuggestionsProps } from "./LiquidGlassSuggestions.types";

export function LiquidGlassSuggestions({
  visible,
  suggestions,
  onSuggestionPress,
  style,
}: LiquidGlassSuggestionsProps): JSX.Element | null {
  if (!visible || suggestions.length === 0) {
    return null;
  }

  return (
    <View style={[styles.container, style]}>
      {suggestions.map((suggestion) => (
        <Pressable
          key={suggestion.id}
          style={styles.row}
          onPress={() => onSuggestionPress(suggestion.id)}
          accessibilityRole="button"
          accessibilityLabel={
            suggestion.accessibilityLabel ??
            `#${suggestion.label}, ${suggestion.countLabel}`
          }
        >
          <Text style={styles.hash}>#</Text>
          <Text style={styles.label}>{suggestion.label}</Text>
          <Text style={styles.count}>{suggestion.countLabel}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.08)",
    overflow: "hidden",
  },
  row: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 8,
  },
  hash: {
    fontSize: 18,
    color: "rgba(0, 0, 0, 0.65)",
    width: 12,
  },
  label: {
    flex: 1,
    fontSize: 15,
    color: "rgba(0, 0, 0, 0.9)",
  },
  count: {
    fontSize: 13,
    color: "rgba(0, 0, 0, 0.55)",
  },
});

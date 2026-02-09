import { Ionicons } from "@expo/vector-icons";
import { type JSX } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import type { LiquidGlassSelectProps } from "./LiquidGlassSelect.types";

export function LiquidGlassSelect({
  value,
  placeholder,
  onPress,
  disabled = false,
  style,
}: LiquidGlassSelectProps): JSX.Element {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[styles.container, style]}
    >
      <Text style={[styles.text, !value && styles.placeholder]}>
        {value || placeholder}
      </Text>
      <Ionicons name="chevron-down" size={16} color="rgba(0, 0, 0, 0.4)" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.1)",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  text: {
    fontSize: 17,
    flex: 1,
  },
  placeholder: {
    color: "rgba(0, 0, 0, 0.4)",
  },
});

import { type JSX } from "react";
import { StyleSheet, TextInput, Text, View } from "react-native";
import type { LiquidGlassInputProps } from "./LiquidGlassInput.types";

export function LiquidGlassInput({
  value,
  onChangeText,
  placeholder = "",
  label,
  onFocus,
  onBlur,
  variant = "form",
  style,
  autoFocus,
  returnKeyType,
  onSubmitEditing,
  blurOnSubmit,
  multiline,
}: LiquidGlassInputProps): JSX.Element {
  const height = variant === "search" ? 48 : label ? 76 : 56;

  return (
    <View style={[styles.container, { height }, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        onFocus={onFocus}
        onBlur={onBlur}
        autoFocus={autoFocus}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        blurOnSubmit={blurOnSubmit}
        multiline={multiline}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.1)",
    borderRadius: 12,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  label: {
    fontSize: 13,
    color: "rgba(0, 0, 0, 0.5)",
    marginBottom: 2,
  },
  input: {
    fontSize: 17,
  },
});

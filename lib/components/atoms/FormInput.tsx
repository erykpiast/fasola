import { useTheme, type Theme } from "@/platform/theme/useTheme";
import { forwardRef, type JSX } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
  type ViewStyle,
} from "react-native";

export const FormInput = forwardRef<
  TextInputType,
  {
    autoFocus?: boolean;
    label: string;
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
    multiline?: boolean;
    style?: ViewStyle;
    returnKeyType?: "done" | "next";
    onSubmitEditing?: () => void;
    blurOnSubmit?: boolean;
    onFocus?: () => void;
  }
>(function FormInput(
  {
    autoFocus = false,
    label,
    value,
    onChangeText,
    placeholder,
    multiline = false,
    style,
    returnKeyType = "done",
    onSubmitEditing,
    blurOnSubmit = true,
    onFocus,
  },
  ref
): JSX.Element {
  const theme = useTheme();

  return (
    <View style={[styles.container, style]}>
      <Text style={[styles.label, getThemeColors(theme).label]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={placeholder}
        autoFocus={autoFocus}
        ref={ref}
        style={[
          styles.input,
          multiline && styles.multiline,
          getThemeColors(theme).input,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={getThemeColors(theme).placeholder.color}
        multiline={multiline}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        submitBehavior={blurOnSubmit ? "blurAndSubmit" : undefined}
        onFocus={onFocus}
      />
    </View>
  );
});

function getThemeColors(theme: Theme) {
  const isDark = theme === "dark";

  return {
    label: {
      color: isDark ? "#E5E5E5" : "#1F1F1F",
    },
    input: {
      backgroundColor: isDark
        ? "rgba(255, 255, 255, 0.1)"
        : "rgba(0, 0, 0, 0.05)",
      borderColor: isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)",
      color: isDark ? "#FFFFFF" : "#000000",
    },
    placeholder: {
      color: isDark ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.4)",
    },
  };
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: "500",
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 28,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  multiline: {
    height: undefined,
    minHeight: 80,
    paddingVertical: 12,
    textAlignVertical: "top",
  },
});

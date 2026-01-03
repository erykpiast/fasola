import {
  GLASS_BORDER_RADIUS,
  GLASS_INPUT_HEIGHT,
  getGlassInputColors,
} from "@/platform/theme/glassStyles";
import { useTheme } from "@/platform/theme/useTheme";
import { forwardRef, type JSX } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
  type ViewStyle,
} from "react-native";
import { GlassContainer } from "./GlassContainer";

export const GlassInput = forwardRef<
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
>(function GlassInput(
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
  const colors = getGlassInputColors(theme);

  return (
    <View style={[styles.container, style]}>
      <Text style={[styles.label, colors.label]}>{label}</Text>
      <GlassContainer
        height={multiline ? undefined : GLASS_INPUT_HEIGHT}
        borderRadius={GLASS_BORDER_RADIUS}
      >
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={placeholder}
          autoFocus={autoFocus}
          ref={ref}
          style={[styles.input, multiline && styles.multiline, colors.text]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder.color}
          multiline={multiline}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          submitBehavior={blurOnSubmit ? "blurAndSubmit" : undefined}
          onFocus={onFocus}
        />
      </GlassContainer>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: "500",
  },
  input: {
    height: GLASS_INPUT_HEIGHT,
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

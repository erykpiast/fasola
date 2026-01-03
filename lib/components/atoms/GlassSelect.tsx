import {
  GLASS_BORDER_RADIUS,
  GLASS_INPUT_HEIGHT,
  getGlassInputColors,
} from "@/platform/theme/glassStyles";
import { useTheme } from "@/platform/theme/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { type JSX } from "react";
import { Pressable, StyleSheet, Text, type ViewStyle } from "react-native";
import { GlassContainer } from "./GlassContainer";

export function GlassSelect({
  value,
  placeholder,
  onPress,
  disabled = false,
  style,
}: {
  value: string;
  placeholder: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}): JSX.Element {
  const theme = useTheme();
  const colors = getGlassInputColors(theme);

  return (
    <GlassContainer
      height={GLASS_INPUT_HEIGHT}
      borderRadius={GLASS_BORDER_RADIUS}
      style={style}
    >
      <Pressable
        style={styles.triggerButton}
        onPress={onPress}
        disabled={disabled}
      >
        <Text
          style={[
            styles.triggerText,
            {
              color: value ? colors.text.color : colors.placeholder.color,
            },
          ]}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={20} color={colors.text.color} />
      </Pressable>
    </GlassContainer>
  );
}

const styles = StyleSheet.create({
  triggerButton: {
    height: GLASS_INPUT_HEIGHT,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  triggerText: {
    fontSize: 16,
    flex: 1,
  },
});

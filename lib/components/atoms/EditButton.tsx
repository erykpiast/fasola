import { MaterialIcons } from "@expo/vector-icons";
import { type JSX } from "react";
import { Pressable, StyleSheet } from "react-native";
import { useTheme, type Theme } from "@/platform/theme/useTheme";

export function EditButton({
  onPress,
}: {
  onPress: () => void;
}): JSX.Element {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[styles.button, getThemeColors(theme).button]}
    >
      <MaterialIcons
        name="edit"
        size={24}
        color={getThemeColors(theme).icon.color}
      />
    </Pressable>
  );
}

function getThemeColors(theme: Theme) {
  const isDark = theme === "dark";

  return {
    button: {
      backgroundColor: isDark
        ? "rgba(0, 0, 0, 0.6)"
        : "rgba(255, 255, 255, 0.9)",
    },
    icon: {
      color: isDark ? "#FFFFFF" : "#000000",
    },
  };
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
});

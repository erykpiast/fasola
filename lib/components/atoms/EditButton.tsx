import { getColors } from "@/platform/theme/glassStyles";
import { useTheme } from "@/platform/theme/useTheme";
import { MaterialIcons } from "@expo/vector-icons";
import { type JSX } from "react";
import { StyleSheet } from "react-native";
import { GlassButton } from "./GlassButton";

export function EditButton({ onPress }: { onPress: () => void }): JSX.Element {
  const theme = useTheme();
  const colors = getColors(theme);

  return (
    <GlassButton onPress={onPress} style={styles.button}>
      <MaterialIcons name="edit" size={24} color={colors.text} />
    </GlassButton>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    bottom: 16,
    right: 16,
    zIndex: 10,
  },
});

import { getColors } from "@/platform/theme/glassStyles";
import { useTheme } from "@/platform/theme/useTheme";
import { MaterialIcons } from "@expo/vector-icons";
import { GlassView } from "expo-glass-effect";
import { type JSX } from "react";
import { Pressable, StyleSheet } from "react-native";

export function EditButton({ onPress }: { onPress: () => void }): JSX.Element {
  const theme = useTheme();
  const colors = getColors(theme);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.7 : 1 }]}
    >
      <GlassView style={styles.container}>
        <MaterialIcons name="edit" size={24} color={colors.text} />
      </GlassView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    bottom: 16,
    left: 16,
    zIndex: 10,
  },
  container: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
});

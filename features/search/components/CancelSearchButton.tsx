import { Ionicons } from "@expo/vector-icons";
import { getColors } from "@/platform/theme/glassStyles";
import { useTheme } from "@/platform/theme/useTheme";
import { GlassView } from "expo-glass-effect";
import { type JSX } from "react";
import { Pressable, StyleSheet } from "react-native";

export function CancelSearchButton({
  onPress,
}: {
  onPress: () => void;
}): JSX.Element {
  const theme = useTheme();
  const colors = getColors(theme);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
    >
      <GlassView style={styles.container}>
        <Ionicons name="close" size={28} color={colors.text} />
      </GlassView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
});

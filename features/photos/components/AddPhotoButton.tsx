import { getColors } from "@/platform/theme/glassStyles";
import { useTheme } from "@/platform/theme/useTheme";
import { GlassView } from "expo-glass-effect";
import { type JSX } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { usePhotoAdd } from "../hooks/usePhotoAdd";

interface AddPhotoButtonProps {
  onPhotoSelected: (uri: string) => void;
}

export function AddPhotoButton({
  onPhotoSelected,
}: AddPhotoButtonProps): JSX.Element {
  const theme = useTheme();
  const colors = getColors(theme);
  const { importPhoto } = usePhotoAdd();

  const handlePress = (): void => {
    importPhoto(onPhotoSelected);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <GlassView style={styles.glass} blurIntensity={20} tint={theme}>
        <Text style={[styles.text, { color: colors.text }]}>+</Text>
      </GlassView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 32,
    alignSelf: "center",
  },
  glass: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  text: {
    fontSize: 32,
    fontWeight: "300",
  },
});

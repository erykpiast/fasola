import { LiquidGlassButton } from "@/modules/liquid-glass";
import { type JSX } from "react";
import { StyleSheet } from "react-native";

export function EditButton({ onPress }: { onPress: () => void }): JSX.Element {
  return (
    <LiquidGlassButton
      onPress={onPress}
      systemImage="pencil"
      style={styles.button}
      accessibilityLabel="Edit"
    />
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    bottom: 28,
    right: 28,
    zIndex: 10,
  },
});

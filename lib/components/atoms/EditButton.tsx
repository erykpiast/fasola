import { LiquidGlassButton } from "@/modules/liquid-glass";
import { type JSX } from "react";
import { StyleSheet, View } from "react-native";

export function EditButton({
  onPress,
  disabled,
}: {
  onPress: () => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <View
      style={[styles.container, disabled && styles.disabled]}
      pointerEvents={disabled ? "none" : "auto"}
    >
      <LiquidGlassButton
        onPress={onPress}
        systemImage="pencil"
        accessibilityLabel="Edit"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 28,
    right: 28,
    zIndex: 10,
  },
  disabled: {
    opacity: 0.4,
  },
});

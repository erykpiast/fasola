import { type JSX } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { LiquidGlassPopoverProps } from "./LiquidGlassPopover.types";

export function LiquidGlassPopover({
  visible,
  options,
  onSelect,
  onDismiss,
}: LiquidGlassPopoverProps): JSX.Element | null {
  if (!visible) {
    return null;
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <View style={styles.menu}>
          {options.map((option) => (
            <Pressable
              key={option.id}
              style={styles.option}
              onPress={() => onSelect(option.id)}
            >
              <Text style={styles.optionText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  menu: {
    backgroundColor: "#fff",
    borderRadius: 12,
    minWidth: 200,
    overflow: "hidden",
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0, 0, 0, 0.1)",
  },
  optionText: {
    fontSize: 17,
  },
});

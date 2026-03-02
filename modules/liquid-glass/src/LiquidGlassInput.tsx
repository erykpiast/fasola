import { type JSX } from "react";
import { Pressable, StyleSheet, TextInput, Text, View } from "react-native";
import type { LiquidGlassInputProps } from "./LiquidGlassInput.types";

export function LiquidGlassInput({
  value,
  onChangeText,
  placeholder = "",
  label,
  showClearButton = false,
  onClear,
  onFocus,
  onBlur,
  variant = "text",
  selectedTags = [],
  onTagPress,
  style,
  autoFocus,
  returnKeyType,
  onSubmitEditing,
  blurOnSubmit,
  multiline,
  maxLength,
}: LiquidGlassInputProps): JSX.Element {
  const shouldShowTags = variant === "tags" || variant === "mixed";
  const shouldShowTextInput = variant === "text" || variant === "mixed";
  const shouldUseAccent = selectedTags.length > 0 && value.trim().length > 0;
  const shouldShowClearButton = showClearButton && (value.length > 0 || selectedTags.length > 0);
  const height = label ? 76 : variant === "mixed" || variant === "tags" ? 48 : 56;

  return (
    <View
      style={[
        styles.container,
        shouldUseAccent && styles.containerAccented,
        { height },
        style,
      ]}
    >
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.row}>
        {shouldShowTags && (
          <View style={styles.tagsContainer}>
            {selectedTags.map((tag) => (
              <Pressable
                key={tag.id}
                onPress={onTagPress ? () => onTagPress(tag.id) : undefined}
                style={[
                  styles.tagPill,
                  shouldUseAccent && styles.tagPillAccented,
                ]}
                accessibilityLabel={tag.accessibilityLabel ?? tag.label}
              >
                <Text style={styles.tagText}>{tag.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {shouldShowTextInput && (
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            onFocus={onFocus}
            onBlur={onBlur}
            autoFocus={autoFocus}
            returnKeyType={returnKeyType}
            onSubmitEditing={onSubmitEditing}
            blurOnSubmit={blurOnSubmit}
            multiline={multiline}
            maxLength={maxLength}
            style={styles.input}
            onKeyPress={(event): void => {
              if (
                event.nativeEvent.key === "Backspace" &&
                value.length === 0 &&
                selectedTags.length > 0
              ) {
                const lastTag = selectedTags[selectedTags.length - 1];
                if (lastTag) {
                  onTagPress?.(lastTag.id);
                }
              }
            }}
          />
        )}
        {shouldShowClearButton && (
          <Pressable
            onPress={onClear}
            style={styles.clearButton}
            accessibilityLabel="Clear search"
          >
            <Text style={styles.clearButtonIcon}>x</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.1)",
    borderRadius: 12,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  containerAccented: {
    borderColor: "rgba(10, 132, 255, 0.4)",
    backgroundColor: "rgba(10, 132, 255, 0.06)",
  },
  label: {
    fontSize: 13,
    color: "rgba(0, 0, 0, 0.5)",
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tagsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  tagPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(0, 0, 0, 0.08)",
  },
  tagPillAccented: {
    backgroundColor: "rgba(10, 132, 255, 0.18)",
  },
  tagText: {
    fontSize: 14,
    color: "rgba(0, 0, 0, 0.8)",
  },
  input: {
    fontSize: 17,
    flex: 1,
  },
  clearButton: {
    marginLeft: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(60, 60, 67, 0.2)",
  },
  clearButtonIcon: {
    fontSize: 12,
    lineHeight: 14,
    color: "rgba(60, 60, 67, 0.85)",
  },
});

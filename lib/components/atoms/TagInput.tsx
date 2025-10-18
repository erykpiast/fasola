import { useTheme, type Theme } from "@/platform/theme/useTheme";
import { useCallback, useState, type JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";

function extractTags(
  inputValue: string,
  existingTags: Array<string>
): Array<string> {
  return inputValue
    .split(/[,\s]+/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .filter((tag) => !existingTags.includes(tag));
}

export function TagInput({
  tags,
  onChange,
  style,
}: {
  tags: Array<string>;
  onChange: (tags: Array<string>) => void;
  style?: ViewStyle;
}): JSX.Element {
  const theme = useTheme();
  const [inputValue, setInputValue] = useState("");

  const handleBlur = useCallback(() => {
    if (inputValue.trim()) {
      const newTags = extractTags(inputValue, tags);

      if (newTags.length > 0) {
        onChange([...tags, ...newTags]);
      }
      setInputValue("");
    }
  }, [inputValue, tags, onChange]);

  const handleRemoveTag = useCallback(
    (tagToRemove: string) => {
      onChange(tags.filter((tag) => tag !== tagToRemove));
    },
    [tags, onChange]
  );

  return (
    <View style={[styles.container, style]}>
      <Text style={[styles.label, getThemeColors(theme).label]}>Tags</Text>
      {tags.length > 0 && (
        <View style={styles.tagsContainer}>
          {tags.map((tag) => (
            <Pressable
              key={tag}
              onPress={() => handleRemoveTag(tag)}
              style={[styles.tagPill, getThemeColors(theme).tagPill]}
            >
              <Text style={[styles.tagText, getThemeColors(theme).tagText]}>
                {tag}
              </Text>
              <Text style={[styles.removeIcon, getThemeColors(theme).tagText]}>
                ×
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <TextInput
        style={[styles.input, getThemeColors(theme).input]}
        value={inputValue}
        onChangeText={setInputValue}
        onBlur={handleBlur}
        placeholder="Add tags (comma or space separated)"
        placeholderTextColor={getThemeColors(theme).placeholder.color}
      />
    </View>
  );
}

function getThemeColors(theme: Theme) {
  const isDark = theme === "dark";

  return {
    label: {
      color: isDark ? "#E5E5E5" : "#1F1F1F",
    },
    input: {
      backgroundColor: isDark
        ? "rgba(255, 255, 255, 0.1)"
        : "rgba(0, 0, 0, 0.05)",
      borderColor: isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)",
      color: isDark ? "#FFFFFF" : "#000000",
    },
    placeholder: {
      color: isDark ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.4)",
    },
    tagPill: {
      backgroundColor: isDark
        ? "rgba(255, 255, 255, 0.15)"
        : "rgba(0, 0, 0, 0.08)",
    },
    tagText: {
      color: isDark ? "#FFFFFF" : "#000000",
    },
  };
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: "500",
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 14,
  },
  removeIcon: {
    fontSize: 18,
    fontWeight: "bold",
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
});

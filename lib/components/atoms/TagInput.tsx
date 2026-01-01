import { parseTags } from "@/lib/utils/recipeValidation";
import { useTheme, type Theme } from "@/platform/theme/useTheme";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";

export function TagInput({
  ref,
  tags,
  onChange,
  style,
  onFocus,
  label = "Tags",
  placeholder = "Add tags...",
}: {
  ref?: React.RefObject<TextInput | null>;
  tags: Array<string>;
  onChange: (tags: Array<string>) => void;
  style?: ViewStyle;
  onFocus?: () => void;
  label?: string;
  placeholder?: string;
}): JSX.Element {
  const theme = useTheme();
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (ref && inputRef.current) {
      ref.current = inputRef.current;
    }
  }, [ref]);

  const addTags = useCallback(() => {
    if (inputValue.trim()) {
      const newTags = parseTags(inputValue).filter(
        (tag) => !tags.includes(tag)
      );

      if (newTags.length > 0) {
        onChange([...tags, ...newTags]);
      }
      setInputValue("");
    }
  }, [inputValue, tags, onChange]);

  const handleSubmit = useCallback(() => {
    addTags();
    inputRef.current?.blur();
  }, [addTags]);

  const handleChangeText = useCallback(
    (text: string) => {
      // Check if last character is comma or space
      if (text.endsWith(",") || text.endsWith(" ")) {
        const textWithoutDelimiter = text.slice(0, -1);
        if (textWithoutDelimiter.trim()) {
          const newTags = parseTags(textWithoutDelimiter).filter(
            (tag) => !tags.includes(tag)
          );

          if (newTags.length > 0) {
            onChange([...tags, ...newTags]);
          }
          setInputValue("");
          return;
        }
      }
      setInputValue(text);
    },
    [tags, onChange]
  );

  const handleRemoveTag = useCallback(
    (tagToRemove: string) => {
      onChange(tags.filter((tag) => tag !== tagToRemove));
    },
    [tags, onChange]
  );

  return (
    <View style={[styles.container, style]}>
      <Text style={[styles.label, getThemeColors(theme).label]}>{label}</Text>
      <View
        style={[styles.inlineContainer, getThemeColors(theme).inlineContainer]}
      >
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={placeholder}
          ref={inputRef}
          style={[styles.input, getThemeColors(theme).input]}
          value={inputValue}
          onChangeText={handleChangeText}
          onBlur={addTags}
          onSubmitEditing={handleSubmit}
          onFocus={onFocus}
          returnKeyType="done"
          placeholder={placeholder}
          placeholderTextColor={getThemeColors(theme).placeholder.color}
        />
        {tags.map((tag) => (
          <Pressable
            key={tag}
            onPress={() => handleRemoveTag(tag)}
            style={[styles.tagPill, getThemeColors(theme).tagPill]}
            accessibilityLabel={`${t("accessibility.removeTag")} ${tag}`}
            accessibilityRole="button"
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
    </View>
  );
}

function getThemeColors(theme: Theme) {
  const isDark = theme === "dark";

  return {
    label: {
      color: isDark ? "#E5E5E5" : "#1F1F1F",
    },
    inlineContainer: {
      backgroundColor: isDark
        ? "rgba(255, 255, 255, 0.1)"
        : "rgba(0, 0, 0, 0.05)",
      borderColor: isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)",
    },
    input: {
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
  inlineContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 48,
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
    flex: 1,
    minWidth: 120,
    paddingHorizontal: 4,
    paddingVertical: 6,
    fontSize: 16,
  },
});

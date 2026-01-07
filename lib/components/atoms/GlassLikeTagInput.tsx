import { parseTags } from "@/lib/utils/recipeValidation";
import { useTranslation } from "@/platform/i18n/useTranslation";
import {
  GLASS_BORDER_RADIUS,
  GLASS_INPUT_HEIGHT,
  getGlassInputColors,
} from "@/platform/theme/glassStyles";
import { useTheme } from "@/platform/theme/useTheme";
import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { GlassLikeContainer } from "./GlassLikeContainer";

export function GlassLikeTagInput({
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
  const colors = getGlassInputColors(theme);
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
      <Text style={[styles.label, colors.label]}>{label}</Text>
      <GlassLikeContainer height={undefined} borderRadius={GLASS_BORDER_RADIUS}>
        <View style={styles.inlineContainer}>
          <TextInput
            accessibilityLabel={label}
            accessibilityHint={placeholder}
            ref={inputRef}
            style={[styles.input, colors.text]}
            value={inputValue}
            onChangeText={handleChangeText}
            onBlur={addTags}
            onSubmitEditing={handleSubmit}
            onFocus={onFocus}
            returnKeyType="done"
            placeholder={placeholder}
            placeholderTextColor={colors.placeholder.color}
          />
          {tags.map((tag) => (
            <Pressable
              key={tag}
              onPress={() => handleRemoveTag(tag)}
              style={styles.tagPill}
              accessibilityLabel={`${t("accessibility.removeTag")} ${tag}`}
              accessibilityRole="button"
            >
              <Text style={[styles.tagText, colors.text]}>{tag}</Text>
              <Text style={[styles.removeIcon, colors.text]}>×</Text>
            </Pressable>
          ))}
        </View>
      </GlassLikeContainer>
    </View>
  );
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: GLASS_INPUT_HEIGHT,
  },
  tagPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
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

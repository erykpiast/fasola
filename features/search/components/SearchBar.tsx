import { useTranslation } from "@/platform/i18n/useTranslation";
import { useSearchBarVisibilityTransition } from "@/features/search/hooks/useSearchBarVisibilityTransition";
import { useTagSuggestions } from "@/features/search/hooks/useTagSuggestions";
import { useTags } from "@/features/tags/context/TagsContext";
import type { TagId } from "@/lib/types/primitives";
import type { Tag } from "@/lib/types/tag";
import { LiquidGlassInput, LiquidGlassSuggestions } from "liquid-glass";
import { useCallback, useMemo, useState, type JSX } from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";

const SEARCH_INPUT_HEIGHT = 48;
const SUGGESTIONS_GAP = 8;
const SUGGESTION_ROW_HEIGHT = 40;
const MIN_SUGGESTIONS_WIDTH = 180;
const MAX_SUGGESTIONS_WIDTH = 320;

function extractSuggestionPrefix(freeText: string): string {
  const withoutTrailingSpaces = freeText.replace(/\s+$/, "");
  if (withoutTrailingSpaces.length === 0) {
    return "";
  }

  const fragments = withoutTrailingSpaces.split(/\s+/);
  const trailingFragment = fragments[fragments.length - 1] ?? "";
  return trailingFragment.replace(/^#+/, "");
}

export function SearchBar({
  value,
  onChangeText,
  onFocus,
  onBlur,
  isHidden,
  onSelectSuggestion,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  isHidden: boolean;
  onSelectSuggestion?: (tag: Tag) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const { tags } = useTags();
  const { containerStyle } = useSearchBarVisibilityTransition(isHidden);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [selectedTags, setSelectedTags] = useState<
    Array<{ id: TagId; label: string; accessibilityLabel?: string }>
  >([]);

  const suggestionPrefix = useMemo((): string => {
    return extractSuggestionPrefix(value);
  }, [value]);
  const excludedTagIds = useMemo((): Array<TagId> => {
    return selectedTags.map((tag) => tag.id);
  }, [selectedTags]);
  const hasUserInput = value.trim().length > 0;

  const handleSelectSuggestion = useCallback(
    (tag: Tag): void => {
      if (onSelectSuggestion) {
        onSelectSuggestion(tag);
        return;
      }

      setSelectedTags((prevTags) => {
        if (prevTags.some((prevTag) => prevTag.id === tag.id)) {
          return prevTags;
        }

        return [
          ...prevTags,
          {
            id: tag.id,
            label: tag.label.replace(/^#/, ""),
            accessibilityLabel: t("search.suggestions.accessibilityLabel", {
              count: tag.recipeCount,
              countLabel: tag.recipeCount > 99 ? "99+" : String(tag.recipeCount),
              tag: tag.label.replace(/^#/, ""),
            }),
          },
        ];
      });

      onChangeText("");
    },
    [onSelectSuggestion, onChangeText, t]
  );

  const { suggestions, handleSuggestionPress } = useTagSuggestions({
    tags,
    prefix: suggestionPrefix,
    onSelectSuggestion: handleSelectSuggestion,
    excludedTagIds,
  });

  const liquidSuggestions = useMemo(() => {
    return suggestions.map((suggestion) => ({
      id: suggestion.id,
      label: suggestion.label,
      countLabel: suggestion.countLabel,
      accessibilityLabel: t("search.suggestions.accessibilityLabel", {
        count: suggestion.recipeCount,
        countLabel: suggestion.countLabel,
        tag: suggestion.label,
      }),
    }));
  }, [suggestions, t]);

  const suggestionsPanelWidth = useMemo((): number => {
    const maxLabelLength = liquidSuggestions.reduce((maxLength, suggestion) => {
      return Math.max(maxLength, suggestion.label.length);
    }, 0);

    const estimatedWidth = maxLabelLength * 11 + 110;
    return Math.max(
      MIN_SUGGESTIONS_WIDTH,
      Math.min(MAX_SUGGESTIONS_WIDTH, estimatedWidth)
    );
  }, [liquidSuggestions]);

  const suggestionsPanelHeight = liquidSuggestions.length * SUGGESTION_ROW_HEIGHT;

  const isSuggestionsVisible =
    isInputFocused && !isHidden && hasUserInput && liquidSuggestions.length > 0;

  const handleFocus = useCallback((): void => {
    setIsInputFocused(true);
    onFocus();
  }, [onFocus]);

  const handleBlur = useCallback((): void => {
    setIsInputFocused(false);
    onBlur();
  }, [onBlur]);

  const handleSubmitEditing = useCallback((): void => {
    setIsInputFocused(false);
  }, []);

  const handleTagPress = useCallback((id: TagId): void => {
    setSelectedTags((prevTags) =>
      prevTags.filter((tag) => tag.id !== id)
    );
  }, []);

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <LiquidGlassInput
        value={value}
        onChangeText={onChangeText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={t("search.placeholder")}
        leadingSystemImage="magnifyingglass"
        showClearButton
        onClear={() => {
          setSelectedTags([]);
          onChangeText("");
        }}
        variant="mixed"
        selectedTags={selectedTags}
        onTagPress={handleTagPress}
        returnKeyType="search"
        onSubmitEditing={handleSubmitEditing}
        blurOnSubmit
      />
      <View style={styles.suggestionsLayer} pointerEvents="box-none">
        <LiquidGlassSuggestions
          visible={isSuggestionsVisible}
          suggestions={liquidSuggestions}
          onSuggestionPress={handleSuggestionPress}
          style={[
            styles.suggestions,
            {
              width: suggestionsPanelWidth,
              height: suggestionsPanelHeight,
            },
          ]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
  },
  suggestionsLayer: {
    position: "absolute",
    left: 0,
    bottom: SEARCH_INPUT_HEIGHT + SUGGESTIONS_GAP,
    zIndex: 20,
  },
  suggestions: {
    alignSelf: "flex-start",
  },
});

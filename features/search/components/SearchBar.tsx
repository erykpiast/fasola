import { useTranslation } from "@/platform/i18n/useTranslation";
import { useSearchBarVisibilityTransition } from "@/features/search/hooks/useSearchBarVisibilityTransition";
import type { SearchQueryTag } from "@/features/search/hooks/useSearchQuery";
import { useTagSuggestions } from "@/features/search/hooks/useTagSuggestions";
import type { TagId } from "@/lib/types/primitives";
import type { Tag } from "@/lib/types/tag";
import { LiquidGlassInput, LiquidGlassSuggestions } from "liquid-glass";
import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";

const SEARCH_INPUT_HEIGHT = 48;
const SUGGESTIONS_GAP = 8;
const SUGGESTION_ROW_HEIGHT = 40;
const MIN_SUGGESTIONS_WIDTH = 180;
const MAX_SUGGESTIONS_WIDTH = 320;

export function SearchBar({
  selectedTags,
  freeText,
  suggestionPrefix,
  allTags,
  onChangeFreeText,
  onAddTagFromSuggestion,
  onRemoveSelectedTag,
  onClearQuery,
  blocked = false,
  isFocused,
  onFocus,
  onBlur,
  onSubmitEditing,
  style,
}: {
  selectedTags: Array<SearchQueryTag>;
  freeText: string;
  suggestionPrefix: string;
  allTags: Array<Tag>;
  onChangeFreeText: (text: string) => void;
  onAddTagFromSuggestion: (tag: Tag) => void;
  onRemoveSelectedTag: (tagId: TagId) => void;
  onClearQuery: () => void;
  blocked?: boolean;
  isFocused?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onSubmitEditing?: () => void;
  style?: ViewStyle;
}): JSX.Element {
  const { t } = useTranslation();
  const { containerStyle } = useSearchBarVisibilityTransition(blocked);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const excludedTagIds = useMemo((): Array<TagId> => {
    return selectedTags.map((tag) => tag.id);
  }, [selectedTags]);

  const { suggestions, handleSuggestionPress } = useTagSuggestions({
    tags: allTags,
    prefix: suggestionPrefix,
    onSelectSuggestion: onAddTagFromSuggestion,
    excludedTagIds,
  });

  const liquidSelectedTags = useMemo(() => {
    return selectedTags.map((tag) => ({
      id: tag.id,
      label: tag.label,
      accessibilityLabel: t("search.selectedPill.accessibilityLabel", {
        tag: tag.label,
      }),
    }));
  }, [selectedTags, t]);

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
  const suggestionsStyle = useMemo(
    (): ViewStyle => ({
      alignSelf: "flex-start",
      width: suggestionsPanelWidth,
      height: suggestionsPanelHeight,
    }),
    [suggestionsPanelWidth, suggestionsPanelHeight]
  );

  const isSuggestionsVisible =
    isInputFocused &&
    !blocked &&
    freeText.trim().length > 0 &&
    liquidSuggestions.length > 0;

  const handleFocus = useCallback((): void => {
    setIsInputFocused(true);
    onFocus?.();
  }, [onFocus]);

  const handleBlur = useCallback((): void => {
    setIsInputFocused(false);
    onBlur?.();
  }, [onBlur]);

  const handleSubmitEditing = useCallback((): void => {
    setIsInputFocused(false);
    onSubmitEditing?.();
  }, [onSubmitEditing]);

  useEffect((): void => {
    if (isFocused === false || blocked) {
      setIsInputFocused(false);
    }
  }, [isFocused, blocked]);

  return (
    <View style={style}>
      <Animated.View style={[styles.container, containerStyle]}>
        <LiquidGlassInput
          value={freeText}
          onChangeText={onChangeFreeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={t("search.placeholder")}
          leadingSystemImage="magnifyingglass"
          showClearButton
          onClear={onClearQuery}
          variant="mixed"
          selectedTags={liquidSelectedTags}
          onTagPress={onRemoveSelectedTag}
          isFocused={isFocused}
          returnKeyType="search"
          onSubmitEditing={handleSubmitEditing}
          blurOnSubmit
        />
        <View style={styles.suggestionsLayer} pointerEvents="box-none">
          <LiquidGlassSuggestions
            visible={isSuggestionsVisible}
            suggestions={liquidSuggestions}
            onSuggestionPress={handleSuggestionPress}
            style={suggestionsStyle}
          />
        </View>
      </Animated.View>
    </View>
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
});

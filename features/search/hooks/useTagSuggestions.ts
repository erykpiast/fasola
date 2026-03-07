import { usePreferences } from "@/features/settings/context/PreferencesContext";
import { getTagDisplayLabel } from "@/features/tags/utils/tagDisplayLabels";
import type { TagId } from "@/lib/types/primitives";
import type { Tag } from "@/lib/types/tag";
import { useCallback, useMemo } from "react";

const MAX_SUGGESTIONS = 5;

export type TagSuggestion = {
  id: TagId;
  label: string;
  recipeCount: number;
  countLabel: string;
};

function normalizePrefix(prefix: string): string {
  return prefix.trim().replace(/^#+/, "").toLowerCase();
}

function formatCount(recipeCount: number): string {
  if (recipeCount > 99) {
    return "99+";
  }

  return String(recipeCount);
}

export function useTagSuggestions({
  tags,
  prefix,
  onSelectSuggestion,
  excludedTagIds = [],
}: {
  tags: Array<Tag>;
  prefix: string;
  onSelectSuggestion: (tag: Tag, displayLabel?: string) => void;
  excludedTagIds?: Array<TagId>;
}): {
  suggestions: Array<TagSuggestion>;
  handleSuggestionPress: (id: TagId) => void;
} {
  const { uiLanguage } = usePreferences();

  const normalizedPrefix = useMemo(
    (): string => normalizePrefix(prefix),
    [prefix]
  );

  const tagsById = useMemo((): Map<TagId, Tag> => {
    return new Map(tags.map((tag) => [tag.id, tag]));
  }, [tags]);

  const excludedTagIdSet = useMemo((): Set<TagId> => {
    return new Set(excludedTagIds);
  }, [excludedTagIds]);

  const suggestions = useMemo((): Array<TagSuggestion> => {
    return tags
      .filter((tag) => !excludedTagIdSet.has(tag.id))
      .filter((tag) => {
        if (normalizedPrefix.length === 0) {
          return true;
        }

        const localizedLabel = getTagDisplayLabel(tag.normalizedLabel, uiLanguage);
        return (
          tag.normalizedLabel.startsWith(normalizedPrefix) ||
          localizedLabel.toLowerCase().startsWith(normalizedPrefix)
        );
      })
      .sort((left, right) => {
        if (left.recipeCount !== right.recipeCount) {
          return right.recipeCount - left.recipeCount;
        }

        return left.normalizedLabel.localeCompare(right.normalizedLabel);
      })
      .slice(0, MAX_SUGGESTIONS)
      .map((tag) => ({
        id: tag.id,
        label: getTagDisplayLabel(tag.normalizedLabel, uiLanguage),
        recipeCount: tag.recipeCount,
        countLabel: formatCount(tag.recipeCount),
      }));
  }, [tags, normalizedPrefix, excludedTagIdSet, uiLanguage]);

  const handleSuggestionPress = useCallback(
    (id: TagId): void => {
      const tag = tagsById.get(id);
      if (!tag) {
        return;
      }

      const displayLabel = getTagDisplayLabel(tag.normalizedLabel, uiLanguage);
      onSelectSuggestion(tag, displayLabel);
    },
    [tagsById, onSelectSuggestion, uiLanguage]
  );

  return useMemo(
    (): {
      suggestions: Array<TagSuggestion>;
      handleSuggestionPress: (id: TagId) => void;
    } => ({
      suggestions,
      handleSuggestionPress,
    }),
    [suggestions, handleSuggestionPress]
  );
}

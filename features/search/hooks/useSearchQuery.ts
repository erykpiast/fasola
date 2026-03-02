import type { TagId } from "@/lib/types/primitives";
import type { Tag } from "@/lib/types/tag";
import { useCallback, useMemo, useState } from "react";

export type SearchQueryTag = {
  id: TagId;
  label: string;
};

export type SearchQuery = {
  selectedTags: Array<SearchQueryTag>;
  freeText: string;
  suggestionPrefix: string;
};

function extractSuggestionPrefix(freeText: string): string {
  const withoutTrailingSpaces = freeText.replace(/\s+$/, "");
  if (withoutTrailingSpaces.length === 0) {
    return "";
  }

  const fragments = withoutTrailingSpaces.split(/\s+/);
  const trailingFragment = fragments[fragments.length - 1] ?? "";
  return trailingFragment.replace(/^#+/, "");
}

export function useSearchQuery(): {
  query: SearchQuery;
  addTagFromSuggestion: (tag: Tag) => void;
  removeSelectedTag: (tagId: TagId) => void;
  setFreeText: (freeText: string) => void;
  clearQuery: () => void;
} {
  const [selectedTags, setSelectedTags] = useState<Array<SearchQueryTag>>([]);
  const [freeText, setFreeTextState] = useState("");

  const addTagFromSuggestion = useCallback((tag: Tag): void => {
    setSelectedTags((previousTags) => {
      if (previousTags.some((previousTag) => previousTag.id === tag.id)) {
        return previousTags;
      }

      return [
        ...previousTags,
        {
          id: tag.id,
          label: tag.label.replace(/^#/, ""),
        },
      ];
    });
    setFreeTextState("");
  }, []);

  const setFreeText = useCallback((nextFreeText: string): void => {
    setFreeTextState(nextFreeText);
  }, []);

  const removeSelectedTag = useCallback((tagId: TagId): void => {
    setSelectedTags((previousTags) =>
      previousTags.filter((previousTag) => previousTag.id !== tagId)
    );
  }, []);

  const clearQuery = useCallback((): void => {
    setSelectedTags([]);
    setFreeTextState("");
  }, []);

  const suggestionPrefix = useMemo((): string => {
    return extractSuggestionPrefix(freeText);
  }, [freeText]);

  const query = useMemo(
    (): SearchQuery => ({
      selectedTags,
      freeText,
      suggestionPrefix,
    }),
    [selectedTags, freeText, suggestionPrefix]
  );

  return useMemo(
    (): {
      query: SearchQuery;
      addTagFromSuggestion: (tag: Tag) => void;
      removeSelectedTag: (tagId: TagId) => void;
      setFreeText: (freeText: string) => void;
      clearQuery: () => void;
    } => ({
      query,
      addTagFromSuggestion,
      removeSelectedTag,
      setFreeText,
      clearQuery,
    }),
    [query, addTagFromSuggestion, removeSelectedTag, setFreeText, clearQuery]
  );
}

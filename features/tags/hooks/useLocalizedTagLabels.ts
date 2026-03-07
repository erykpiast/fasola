import { usePreferences } from "@/features/settings/context/PreferencesContext";
import { useTags } from "@/features/tags/context/TagsContext";
import { resolveLocalizedTagLabels } from "@/features/tags/utils/resolveRecipeTags";
import type { TagId } from "@/lib/types/primitives";

export function useLocalizedTagLabels(tagIds: Array<TagId>): Array<`#${string}`> {
  const { tagLookup } = useTags();
  const { uiLanguage } = usePreferences();
  return resolveLocalizedTagLabels(tagIds, tagLookup, uiLanguage);
}

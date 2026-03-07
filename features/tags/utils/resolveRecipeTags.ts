import type { AppLanguage } from "@/lib/types/language";
import type { TagId } from "@/lib/types/primitives";
import type { Tag } from "@/lib/types/tag";
import { getAllTagVariants, getTagDisplayLabel } from "./tagDisplayLabels";

export function buildTagLookup(tags: Array<Tag>): Map<TagId, Tag> {
  return new Map(tags.map((tag) => [tag.id, tag]));
}

export function resolveLocalizedTagLabels(
  tagIds: Array<TagId>,
  lookup: Map<TagId, Tag>,
  language: AppLanguage
): Array<`#${string}`> {
  return tagIds
    .map((tagId) => {
      const tag = lookup.get(tagId);
      if (!tag) return undefined;
      const display = getTagDisplayLabel(tag.normalizedLabel, language);
      return `#${display}` as const;
    })
    .filter((label): label is `#${string}` => label !== undefined);
}

export function resolveNormalizedTagTexts(
  tagIds: Array<TagId>,
  lookup: Map<TagId, Tag>
): Array<string> {
  return tagIds.flatMap((tagId) => {
    const tag = lookup.get(tagId);
    if (!tag) return [];
    return getAllTagVariants(tag.normalizedLabel);
  });
}

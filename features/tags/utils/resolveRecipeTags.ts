import type { TagId } from "@/lib/types/primitives";
import type { Tag } from "@/lib/types/tag";

export function buildTagLookup(tags: Array<Tag>): Map<TagId, Tag> {
  return new Map(tags.map((tag) => [tag.id, tag]));
}

export function resolveTagLabels(
  tagIds: Array<TagId>,
  lookup: Map<TagId, Tag>
): Array<`#${string}`> {
  return tagIds
    .map((tagId) => lookup.get(tagId)?.label)
    .filter((label): label is `#${string}` => label !== undefined);
}

export function resolveNormalizedTagTexts(
  tagIds: Array<TagId>,
  lookup: Map<TagId, Tag>
): Array<string> {
  return tagIds
    .map((tagId) => lookup.get(tagId)?.normalizedLabel)
    .filter((normalizedLabel): normalizedLabel is string => normalizedLabel !== undefined);
}

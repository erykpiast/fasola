import * as Crypto from "expo-crypto";
import { storage } from "../storage";
import type { StorageKey, TagId } from "../types/primitives";
import type { Tag } from "../types/tag";

const TAGS_KEY: StorageKey = "@tags";

let lockChain = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = lockChain.then(fn, fn);
  lockChain = next.then(() => {}, () => {});
  return next;
}

function normalizeLabel(label: string): { label: `#${string}`; normalizedLabel: string } | null {
  const trimmed = label.trim();
  const withoutHash = trimmed.replace(/^#+/, "");

  if (!withoutHash || /\s/.test(withoutHash)) {
    return null;
  }

  const normalizedLabel = withoutHash.toLowerCase();

  return {
    label: `#${normalizedLabel}`,
    normalizedLabel,
  };
}

function dedupeTagIds(tagIds: Array<TagId>): Array<TagId> {
  return Array.from(new Set(tagIds));
}

function computeDiff(
  prevTagIds: Array<TagId>,
  nextTagIds: Array<TagId>
): { removed: Array<TagId>; added: Array<TagId> } {
  const prevSet = new Set(dedupeTagIds(prevTagIds));
  const nextSet = new Set(dedupeTagIds(nextTagIds));

  const removed = Array.from(prevSet).filter((tagId) => !nextSet.has(tagId));
  const added = Array.from(nextSet).filter((tagId) => !prevSet.has(tagId));

  return { removed, added };
}

type RecipeTagDiff = {
  prevTagIds: Array<TagId>;
  nextTagIds: Array<TagId>;
};

type TagResolutionInput = {
  nextTagIds?: Array<TagId>;
  nextLabels?: Array<string>;
};

type PrevTagIdsInput = Array<TagId> | (() => Promise<Array<TagId>>);

class TagsRepository {
  private async readAll(): Promise<Array<Tag>> {
    const data = await storage.getItem(TAGS_KEY);
    if (!data) {
      return [];
    }

    try {
      const parsed = JSON.parse(data) as Array<Tag>;
      return parsed.filter(
        (tag) =>
          typeof tag?.id === "string" &&
          typeof tag?.label === "string" &&
          typeof tag?.normalizedLabel === "string" &&
          typeof tag?.recipeCount === "number" &&
          typeof tag?.lastUsedAt === "number"
      );
    } catch {
      return [];
    }
  }

  private async writeAll(tags: Array<Tag>): Promise<void> {
    await storage.setItem(TAGS_KEY, JSON.stringify(tags));
  }

  async getAll(): Promise<Array<Tag>> {
    return this.readAll();
  }

  async getById(id: TagId): Promise<Tag | null> {
    const tags = await this.readAll();
    return tags.find((tag) => tag.id === id) ?? null;
  }

  async getByIds(ids: Array<TagId>): Promise<Array<Tag>> {
    const tags = await this.readAll();
    const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
    return dedupeTagIds(ids)
      .map((id) => tagsById.get(id))
      .filter((tag): tag is Tag => tag !== undefined);
  }

  async findByNormalized(normalized: string): Promise<Tag | null> {
    const normalizedLabel = normalizeLabel(normalized)?.normalizedLabel;
    if (!normalizedLabel) {
      return null;
    }

    const tags = await this.readAll();
    return tags.find((tag) => tag.normalizedLabel === normalizedLabel) ?? null;
  }

  async mutateRecipeTags<T>(
    input: {
      prevTagIds: PrevTagIdsInput;
      nextTagIds?: Array<TagId>;
      nextLabels?: Array<string>;
    },
    commitRecipe: (resolvedNextTagIds: Array<TagId>) => Promise<T>
  ): Promise<T> {
    return withLock(async () => {
      const prevTagIds =
        typeof input.prevTagIds === "function"
          ? await input.prevTagIds()
          : input.prevTagIds;
      const tags = await this.readAll();
      const resolvedNextTagIds = this.resolveNextTagIds(tags, {
        nextTagIds: input.nextTagIds,
        nextLabels: input.nextLabels,
      });
      const result = await commitRecipe(resolvedNextTagIds);

      this.applyDiffs(tags, [
        {
          prevTagIds,
          nextTagIds: resolvedNextTagIds,
        },
      ]);
      this.pruneZeroCountTags(tags);
      await this.writeAll(tags);

      return result;
    });
  }

  async mutateMultipleRecipeDiffs<T>(
    commitRecipe: () => Promise<{
      result: T;
      diffs: Array<RecipeTagDiff>;
    }>
  ): Promise<T> {
    return withLock(async () => {
      const tags = await this.readAll();
      const { result, diffs } = await commitRecipe();
      this.applyDiffs(tags, diffs);
      this.pruneZeroCountTags(tags);
      await this.writeAll(tags);
      return result;
    });
  }

  private resolveNextTagIds(
    tags: Array<Tag>,
    input: TagResolutionInput
  ): Array<TagId> {
    if (input.nextLabels !== undefined) {
      const tagsByNormalized = new Map(
        tags.map((tag) => [tag.normalizedLabel, tag])
      );
      const now = Date.now();
      const normalizedLabels = Array.from(
        new Set(
          input.nextLabels
            .map((label) => normalizeLabel(label))
            .filter(
              (
                normalized
              ): normalized is {
                label: `#${string}`;
                normalizedLabel: string;
              } => normalized !== null
            )
            .map((normalized) => normalized.normalizedLabel)
        )
      );

      if (normalizedLabels.length === 0) {
        return [];
      }

      const resolvedTagIds: Array<TagId> = [];

      for (const normalizedLabel of normalizedLabels) {
        const existing = tagsByNormalized.get(normalizedLabel);
        if (existing) {
          existing.lastUsedAt = now;
          resolvedTagIds.push(existing.id);
          continue;
        }

        const created: Tag = {
          id: Crypto.randomUUID(),
          label: `#${normalizedLabel}`,
          normalizedLabel,
          recipeCount: 0,
          lastUsedAt: now,
        };
        tags.push(created);
        tagsByNormalized.set(normalizedLabel, created);
        resolvedTagIds.push(created.id);
      }

      return resolvedTagIds;
    }

    return dedupeTagIds(input.nextTagIds ?? []);
  }

  private applyDiffs(tags: Array<Tag>, diffs: Array<RecipeTagDiff>): void {
    const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
    const now = Date.now();

    for (const diff of diffs) {
      const { removed, added } = computeDiff(diff.prevTagIds, diff.nextTagIds);

      for (const tagId of removed) {
        const tag = tagsById.get(tagId);
        if (!tag) {
          continue;
        }

        tag.recipeCount = Math.max(0, tag.recipeCount - 1);
      }

      for (const tagId of added) {
        const tag = tagsById.get(tagId);
        if (!tag) {
          continue;
        }

        tag.recipeCount += 1;
        tag.lastUsedAt = now;
      }
    }

  }

  private pruneZeroCountTags(tags: Array<Tag>): void {
    for (let index = tags.length - 1; index >= 0; index -= 1) {
      if (tags[index].recipeCount <= 0) {
        tags.splice(index, 1);
      }
    }
  }
}

export const tagsRepository = new TagsRepository();

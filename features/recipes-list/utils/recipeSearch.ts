import { resolveNormalizedTagTexts } from "@/features/tags/utils/resolveRecipeTags";
import type { TagId } from "@/lib/types/primitives";
import type { Recipe } from "@/lib/types/recipe";
import type { Tag } from "@/lib/types/tag";
import createFuzzySearch from "@nozbe/microfuzz";

export function filterRecipes(
  recipes: Array<Recipe>,
  searchTerm: string,
  tagLookup: Map<TagId, Tag> = new Map()
): Array<Recipe> {
  const normalizedSearchTerm = searchTerm.trim().replace(/^#/, "");

  if (!normalizedSearchTerm) {
    return recipes;
  }

  const fuzzySearch = createFuzzySearch(recipes, {
    getText: (recipe) => [
      recipe.metadata.title || "",
      ...resolveNormalizedTagTexts(recipe.metadata.tagIds, tagLookup),
    ],
  });

  return fuzzySearch(normalizedSearchTerm).map((result) => result.item);
}

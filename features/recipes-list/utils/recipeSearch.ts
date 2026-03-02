import { resolveNormalizedTagTexts } from "@/features/tags/utils/resolveRecipeTags";
import type { SearchQuery } from "@/features/search/hooks/useSearchQuery";
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

export function filterRecipesWithQuery(
  recipes: Array<Recipe>,
  query: SearchQuery,
  tagLookup: Map<TagId, Tag>
): Array<Recipe> {
  const selectedTagIds = query.selectedTags.map((tag) => tag.id);
  const andFilteredRecipes = recipes.filter((recipe) => {
    return selectedTagIds.every((selectedTagId) =>
      recipe.metadata.tagIds.includes(selectedTagId)
    );
  });

  const normalizedFreeText = query.freeText.trim().replace(/^#/, "");
  if (!normalizedFreeText) {
    return andFilteredRecipes;
  }

  const fuzzySearch = createFuzzySearch(andFilteredRecipes, {
    getText: (recipe) => [
      recipe.metadata.title || "",
      ...resolveNormalizedTagTexts(recipe.metadata.tagIds, tagLookup),
    ],
  });

  return fuzzySearch(normalizedFreeText).map((result) => result.item);
}

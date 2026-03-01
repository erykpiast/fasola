import type { Recipe } from "@/lib/types/recipe";
import createFuzzySearch from "@nozbe/microfuzz";

export function filterRecipes(
  recipes: Array<Recipe>,
  searchTerm: string
): Array<Recipe> {
  const normalizedSearchTerm = searchTerm.trim().replace(/^#/, "");

  if (!normalizedSearchTerm) {
    return recipes;
  }

  const fuzzySearch = createFuzzySearch(recipes, {
    getText: (recipe) => [
      recipe.metadata.title || "",
      ...recipe.metadata.tags.map((tag: string) => tag.slice(1)),
    ],
  });

  return fuzzySearch(normalizedSearchTerm).map((result) => result.item);
}

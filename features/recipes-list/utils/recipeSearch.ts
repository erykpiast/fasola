import type { Recipe } from "@/lib/types/recipe";
import createFuzzySearch from "@nozbe/microfuzz";

export function filterRecipes(
  recipes: Array<Recipe>,
  searchTerm: string
): Array<Recipe> {
  if (!searchTerm || !searchTerm.trim()) {
    return recipes;
  }

  const fuzzySearch = createFuzzySearch(recipes, {
    getText: (recipe) => [
      recipe.metadata.title || "",
      ...recipe.metadata.tags.map((tag: string) => tag.slice(1)),
    ],
  });

  return fuzzySearch(searchTerm).map((result) => result.item);
}

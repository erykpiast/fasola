import { useRecipes } from "@/features/recipes-list/context/RecipesContext";
import type { RecipeId } from "@/lib/types/primitives";
import type { Recipe } from "@/lib/types/recipe";

export function useRecipeById(id: RecipeId): Recipe | null {
  const { recipes } = useRecipes();
  return recipes.find((recipe) => recipe.id === id) ?? null;
}

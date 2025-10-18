import { use } from "react";
import { recipeRepository } from "@/lib/repositories/recipes";
import type { Recipe } from "@/lib/types/recipe";
import type { RecipeId } from "@/lib/types/primitives";

const recipeCache = new Map<RecipeId, Promise<Recipe | null>>();

function getRecipePromise(id: RecipeId): Promise<Recipe | null> {
  if (!recipeCache.has(id)) {
    recipeCache.set(id, recipeRepository.getById(id));
  }
  return recipeCache.get(id)!;
}

export function useRecipeById(id: RecipeId): Recipe | null {
  return use(getRecipePromise(id));
}

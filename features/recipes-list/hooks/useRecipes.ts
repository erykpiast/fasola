import { use, useCallback, useMemo, useState } from "react";
import { recipeRepository } from "../../../lib/repositories/recipes";
import type { Recipe, RecipeMetadata } from "../../../lib/types/recipe";

let recipesPromise: Promise<Recipe[]> | null = null;

function getRecipesPromise(): Promise<Recipe[]> {
  if (!recipesPromise) {
    recipesPromise = recipeRepository.getAll();
  }
  return recipesPromise;
}

export function useRecipes() {
  const initialRecipes = use(getRecipesPromise());
  const [recipes, setRecipes] = useState<Recipe[]>(initialRecipes);

  const addRecipe = useCallback(
    async (photoUri: string, metadata: RecipeMetadata): Promise<void> => {
      const newRecipe = await recipeRepository.save({ photoUri, metadata });
      setRecipes((prev) => [...prev, newRecipe]);
      recipesPromise = null;
    },
    []
  );

  const updateRecipe = useCallback(
    async (id: string, metadata: RecipeMetadata): Promise<void> => {
      const updatedRecipe = await recipeRepository.update(id, metadata);
      setRecipes((prev) => prev.map((r) => (r.id === id ? updatedRecipe : r)));
      recipesPromise = null;
    },
    []
  );

  const deleteRecipe = useCallback(async (id: string): Promise<void> => {
    await recipeRepository.delete(id);
    setRecipes((prev) => prev.filter((r) => r.id !== id));
    recipesPromise = null;
  }, []);

  return useMemo(
    () => ({
      recipes,
      addRecipe,
      updateRecipe,
      deleteRecipe,
    }),
    [recipes, addRecipe, updateRecipe, deleteRecipe]
  );
}

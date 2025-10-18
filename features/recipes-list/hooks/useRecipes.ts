import { use, useCallback, useMemo, useState } from "react";
import { recipeRepository } from "@/lib/repositories/recipes";
import type { Recipe, RecipeMetadata } from "@/lib/types/recipe";
import type { PhotoUri, RecipeId } from "@/lib/types/primitives";

let recipesPromise: Promise<Array<Recipe>> | null = null;

function getRecipesPromise(): Promise<Array<Recipe>> {
  if (!recipesPromise) {
    recipesPromise = recipeRepository.getAll();
  }
  return recipesPromise;
}

export function useRecipes(): {
  recipes: Array<Recipe>;
  addRecipe: (photoUri: PhotoUri, metadata: RecipeMetadata) => Promise<void>;
  updateRecipe: (id: RecipeId, metadata: RecipeMetadata) => Promise<void>;
  deleteRecipe: (id: RecipeId) => Promise<void>;
} {
  const initialRecipes = use(getRecipesPromise());
  const [recipes, setRecipes] = useState<Array<Recipe>>(initialRecipes);

  const addRecipe = useCallback(
    async (photoUri: PhotoUri, metadata: RecipeMetadata): Promise<void> => {
      const newRecipe = await recipeRepository.save({ photoUri, metadata });
      setRecipes((prev) => [...prev, newRecipe]);
      recipesPromise = null;
    },
    []
  );

  const updateRecipe = useCallback(
    async (id: RecipeId, metadata: RecipeMetadata): Promise<void> => {
      const updatedRecipe = await recipeRepository.update(id, metadata);
      setRecipes((prev) => prev.map((r) => (r.id === id ? updatedRecipe : r)));
      recipesPromise = null;
    },
    []
  );

  const deleteRecipe = useCallback(async (id: RecipeId): Promise<void> => {
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

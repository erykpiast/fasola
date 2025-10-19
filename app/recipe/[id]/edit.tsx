import { EditRecipeForm } from "@/features/recipe-form/components/EditRecipeForm";
import { useRecipeById } from "@/features/recipe-preview/hooks/useRecipeById";
import { useRecipes } from "@/features/recipes-list/context/RecipesContext";
import type { RecipeMetadata } from "@/lib/types/recipe";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, type JSX } from "react";

export default function EditRecipeScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipe = useRecipeById(id);
  const { updateRecipe } = useRecipes();

  const handleSubmit = useCallback(
    async (metadata: RecipeMetadata) => {
      if (!recipe) return;

      await updateRecipe(recipe.id, metadata);
      router.back();
    },
    [updateRecipe, recipe]
  );

  if (!recipe) {
    router.back();
    return <></>;
  }

  return <EditRecipeForm recipe={recipe} onSubmit={handleSubmit} />;
}

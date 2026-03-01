import { useDebugContext } from "@/features/photo-adjustment/context/DebugContext";
import { EditRecipeForm } from "@/features/recipe-form/components/EditRecipeForm";
import { useRecipeById } from "@/features/recipe-preview/hooks/useRecipeById";
import { useRecipes } from "@/features/recipes-list/context/RecipesContext";
import { Alert } from "@/lib/alert";
import type { RecipeMetadataWrite } from "@/lib/repositories/types";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState, type JSX } from "react";

export default function EditRecipeScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipe = useRecipeById(id);
  const { updateRecipe } = useRecipes();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { setDebugData } = useDebugContext();

  useEffect(() => {
    return () => {
      setDebugData(null);
    };
  }, [setDebugData]);

  const handleSubmit = useCallback(
    async (metadata: RecipeMetadataWrite): Promise<void> => {
      if (!recipe || isSubmitting) return;

      setIsSubmitting(true);
      try {
        await updateRecipe(recipe.id, metadata);
        router.back();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        Alert.alert(t("errors.saveFailed"), errorMessage);
      } finally {
        setIsSubmitting(false);
      }
    },
    [updateRecipe, recipe, isSubmitting, t]
  );

  if (!recipe) {
    router.back();
    return <></>;
  }

  return <EditRecipeForm recipe={recipe} onSubmit={handleSubmit} />;
}

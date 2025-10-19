import { EditRecipeForm } from "@/features/recipe-form/components/EditRecipeForm";
import { useRecipeById } from "@/features/recipe-preview/hooks/useRecipeById";
import { useRecipes } from "@/features/recipes-list/context/RecipesContext";
import type { RecipeMetadata } from "@/lib/types/recipe";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState, type JSX } from "react";
import { Alert, Platform } from "react-native";
import { useTranslation } from "@/platform/i18n/useTranslation";

export default function EditRecipeScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipe = useRecipeById(id);
  const { updateRecipe } = useRecipes();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (metadata: RecipeMetadata) => {
      if (!recipe || isSubmitting) return;

      setIsSubmitting(true);
      try {
        await updateRecipe(recipe.id, metadata);
        router.back();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (Platform.OS === "web") {
          window.alert(`${t("errors.saveFailed")}\n\n${errorMessage}`);
        } else {
          Alert.alert(t("errors.saveFailed"), errorMessage);
        }
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

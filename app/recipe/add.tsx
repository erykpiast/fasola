import { AddRecipeForm } from "@/features/recipe-form/components/AddRecipeForm";
import { useRecipes } from "@/features/recipes-list/context/RecipesContext";
import type { PhotoUri } from "@/lib/types/primitives";
import type { RecipeMetadata } from "@/lib/types/recipe";
import { router, useLocalSearchParams } from "expo-router";
import { type JSX, useCallback, useState } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, type Theme } from "@/platform/theme/useTheme";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { Alert } from "@/lib/alert";

export default function AddRecipeScreen(): JSX.Element {
  const { uri } = useLocalSearchParams<{ uri: PhotoUri }>();
  const { addRecipe } = useRecipes();
  const theme = useTheme();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (metadata: RecipeMetadata) => {
      if (!uri || isSubmitting) return;

      setIsSubmitting(true);
      try {
        await addRecipe(uri, metadata);
        router.back();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Alert.alert(t("errors.saveFailed"), errorMessage);
      } finally {
        setIsSubmitting(false);
      }
    },
    [uri, addRecipe, isSubmitting, t],
  );

  if (!uri) {
    return (
      <SafeAreaView
        style={[styles.container, getThemeColors(theme).container]}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.container, getThemeColors(theme).container]}>
      <AddRecipeForm photoUri={uri} onSubmit={handleSubmit} />
    </SafeAreaView>
  );
}

function getThemeColors(theme: Theme) {
  const isDark = theme === "dark";

  return {
    container: {
      backgroundColor: isDark ? "#000000" : "#FFFFFF",
    },
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

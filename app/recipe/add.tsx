import { AddRecipeForm } from "@/features/recipe-form/components/AddRecipeForm";
import { useRecipes } from "@/features/recipes-list/context/RecipesContext";
import type { PhotoUri } from "@/lib/types/primitives";
import type { RecipeMetadata } from "@/lib/types/recipe";
import { router, useLocalSearchParams } from "expo-router";
import { type JSX, useCallback } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, type Theme } from "@/platform/theme/useTheme";

export default function AddRecipeScreen(): JSX.Element {
  const { uri } = useLocalSearchParams<{ uri: PhotoUri }>();
  const { addRecipe } = useRecipes();
  const theme = useTheme();

  const handleSubmit = useCallback(
    async (metadata: RecipeMetadata) => {
      if (!uri) return;
      await addRecipe(uri, metadata);
      router.back();
    },
    [uri, addRecipe],
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

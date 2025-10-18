import { router } from "expo-router";
import { Suspense, useCallback, type JSX } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { StyleSheet, View } from "react-native";
import { AddPhotoButton } from "../features/photos/components/AddPhotoButton";
import { EmptyState } from "../features/photos/components/EmptyState";
import { RecipeGrid } from "../features/recipes-list/components/RecipeGrid";
import { useRecipes } from "../features/recipes-list/hooks/useRecipes";
import type { PhotoUri, RecipeId } from "../lib/types/primitives";
import { getColors } from "../platform/theme/glassStyles";
import { useTheme } from "../platform/theme/useTheme";

function ErrorFallback(): JSX.Element {
  return <View style={{ flex: 1 }} />;
}

function Content(): JSX.Element {
  const theme = useTheme();
  const colors = getColors(theme);
  const { recipes, addRecipe } = useRecipes();

  const handleAddPhoto = useCallback(
    async (uri: PhotoUri): Promise<void> => {
      await addRecipe(uri, { tags: [] });
    },
    [addRecipe]
  );

  const handleRecipeTap = useCallback((id: RecipeId): void => {
    router.push(`/recipe/${id}`);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {recipes.length === 0 ? (
        <EmptyState />
      ) : (
        <RecipeGrid recipes={recipes} onRecipeTap={handleRecipeTap} />
      )}
      <AddPhotoButton onPhotoSelected={handleAddPhoto} />
    </View>
  );
}

export default function Index(): JSX.Element {
  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <Suspense fallback={<View style={{ flex: 1 }} />}>
        <Content />
      </Suspense>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

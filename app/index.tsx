import { router } from "expo-router";
import { Suspense, type JSX } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { StyleSheet, View } from "react-native";
import { AddPhotoButton } from "../features/photos/components/AddPhotoButton";
import { EmptyState } from "../features/photos/components/EmptyState";
import { PhotoGrid } from "../features/photos/components/PhotoGrid";
import type { Photo } from "../features/photos/types";
import { useRecipes } from "../features/recipes-list/hooks/useRecipes";
import { getColors } from "../platform/theme/glassStyles";
import { useTheme } from "../platform/theme/useTheme";

function ErrorFallback(): JSX.Element {
  return <View style={{ flex: 1 }} />;
}

function Content(): JSX.Element {
  const theme = useTheme();
  const colors = getColors(theme);
  const { recipes, addRecipe } = useRecipes();

  const photos: Photo[] = recipes.map((recipe) => ({
    id: recipe.id,
    uri: recipe.photoUri,
    timestamp: recipe.timestamp,
    title: recipe.metadata.title,
  }));

  const handleAddPhoto = async (uri: string): Promise<void> => {
    await addRecipe(uri, { tags: [] });
  };

  const handlePhotoTap = (id: string): void => {
    router.push(`/recipe/${id}`);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {photos.length === 0 ? (
        <EmptyState />
      ) : (
        <PhotoGrid photos={photos} onPhotoTap={handlePhotoTap} />
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

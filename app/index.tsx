import { router } from "expo-router";
import { Suspense, useCallback, type JSX } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { StyleSheet, Text, View } from "react-native";
import { AddPhotoButton } from "../features/photos/components/AddPhotoButton";
import { EmptyState } from "../features/photos/components/EmptyState";
import { RecipeGrid } from "../features/recipes-list/components/RecipeGrid";
import { useRecipes } from "../features/recipes-list/context/RecipesContext";
import type { RecipeId } from "../lib/types/primitives";
import { getColors } from "../platform/theme/glassStyles";
import { useTheme } from "../platform/theme/useTheme";

function ErrorFallback({ error }: { error?: Error }): JSX.Element {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorTitle}>Error loading recipes</Text>
      {error && <Text style={styles.errorMessage}>{error.message}</Text>}
    </View>
  );
}

function Content(): JSX.Element {
  const theme = useTheme();
  const colors = getColors(theme);
  const { recipes } = useRecipes();

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
      <AddPhotoButton />
    </View>
  );
}

export default function Index(): JSX.Element {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Suspense fallback={<View style={styles.suspenseFallback} />}>
        <Content />
      </Suspense>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  suspenseFallback: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorTitle: {
    color: "red",
    marginBottom: 10,
  },
  errorMessage: {
    color: "gray",
  },
});

import { useLocalSearchParams, router } from "expo-router";
import { ScrollView, StyleSheet, ActivityIndicator, View } from "react-native";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useRecipes } from "@/features/recipes-list/hooks/useRecipes";
import { RecipeHeader } from "@/lib/components/molecules/RecipeHeader";

function RecipeDetailContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { recipes } = useRecipes();

  const recipe = recipes.find((r) => r.id === id);

  if (!recipe) {
    return null;
  }

  return (
    <ScrollView style={styles.container}>
      <RecipeHeader photoUri={recipe.photoUri} title={recipe.metadata.title} />
    </ScrollView>
  );
}

export default function RecipeDetailScreen() {
  return (
    <ErrorBoundary fallback={<View style={styles.error} />}>
      <Suspense fallback={<ActivityIndicator style={styles.loading} />}>
        <RecipeDetailContent />
      </Suspense>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  error: {
    flex: 1,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
  },
});

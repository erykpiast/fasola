import { RecipeViewScreen } from "@/features/recipe-preview/components/RecipeViewScreen";
import { useLocalSearchParams } from "expo-router";
import { Suspense, type JSX } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import type { RecipeId } from "@/lib/types/primitives";

function RecipeDetailContent(): JSX.Element | null {
  const { id } = useLocalSearchParams<{ id: RecipeId }>();

  if (!id) {
    return null;
  }

  return <RecipeViewScreen id={id} />;
}

export default function RecipeDetailScreen(): JSX.Element {
  return (
    <ErrorBoundary fallback={<View style={styles.error} />}>
      <Suspense fallback={<ActivityIndicator style={styles.loading} />}>
        <RecipeDetailContent />
      </Suspense>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
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

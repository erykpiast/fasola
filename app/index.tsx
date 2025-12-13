import { router } from "expo-router";
import { Suspense, useCallback, useEffect, type JSX } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  DebugProvider,
  useDebugContext,
} from "../features/photo-adjustment/context/DebugContext";
import { EmptyState } from "../features/photos/components/EmptyState";
import { AddRecipeButton } from "../features/recipe-form/components/AddRecipeButton";
import { RecipeGrid } from "../features/recipes-list/components/RecipeGrid";
import { useRecipes } from "../features/recipes-list/context/RecipesContext";
import { useRecipeFilter } from "../features/recipes-list/hooks/useRecipeFilter";
import { CancelSearchButton } from "../features/search/components/CancelSearchButton";
import { SearchBar } from "../features/search/components/SearchBar";
import { useSearchFocus } from "../features/search/hooks/useSearchFocus";
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
  const { filteredRecipes, searchTerm, setSearchTerm, clearSearch } =
    useRecipeFilter(recipes);
  const { isFocused, handleFocus, handleBlur, handleCancel } = useSearchFocus();
  const { setDebugData } = useDebugContext();

  useEffect(() => {
    return () => {
      setDebugData(null);
    };
  }, [setDebugData]);

  const handleRecipeTap = useCallback((id: RecipeId): void => {
    router.push(`/recipe/${id}`);
  }, []);

  const handleCancelPress = useCallback(() => {
    handleCancel();
    clearSearch();
  }, [handleCancel, clearSearch]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {recipes.length === 0 ? (
        <EmptyState />
      ) : (
        <RecipeGrid recipes={filteredRecipes} onRecipeTap={handleRecipeTap} />
      )}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoid}
      >
        <View style={styles.bottomBar}>
          <SearchBar
            value={searchTerm}
            onChangeText={setSearchTerm}
            onFocus={handleFocus}
            onBlur={handleBlur}
            isFocused={isFocused}
          />
          {isFocused ? (
            <CancelSearchButton onPress={handleCancelPress} />
          ) : (
            <AddRecipeButton />
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

export default function Index(): JSX.Element {
  return (
    <DebugProvider>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Suspense fallback={<View style={styles.suspenseFallback} />}>
          <Content />
        </Suspense>
      </ErrorBoundary>
    </DebugProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoid: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomBar: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
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

import { router } from "expo-router";
import { LiquidGlassPopover } from "liquid-glass";
import { Suspense, useCallback, useEffect, type JSX } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useDebugContext } from "../features/photo-adjustment/context/DebugContext";
import { EmptyState } from "../features/photos/components/EmptyState";
import {
  usePhotoImport,
  type ImportOption,
} from "../features/photos/hooks/usePhotoImport";
import { AddRecipeButton } from "../features/recipe-form/components/AddRecipeButton";
import { RecipeGrid } from "../features/recipes-list/components/RecipeGrid";
import { useRecipes } from "../features/recipes-list/context/RecipesContext";
import { useRecipeFilter } from "../features/recipes-list/hooks/useRecipeFilter";
import { SearchBar } from "../features/search/components/SearchBar";
import { useSearchFocus } from "../features/search/hooks/useSearchFocus";
import type { RecipeId } from "../lib/types/primitives";
import { useTranslation } from "../platform/i18n/useTranslation";
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
  const { t } = useTranslation();
  const { recipes } = useRecipes();
  const { filteredRecipes, searchTerm, setSearchTerm } =
    useRecipeFilter(recipes);
  const { handleFocus, handleBlur, key } = useSearchFocus();
  const { setDebugData } = useDebugContext();
  const { showPopover, handleOptionSelect, popoverVisible, dismissPopover } =
    usePhotoImport();

  useEffect(() => {
    return () => {
      setDebugData(null);
    };
  }, [setDebugData]);

  const handleRecipeTap = useCallback((id: RecipeId): void => {
    router.push(`/recipe/${id}`);
  }, []);

  const handleImportOptionSelect = useCallback(
    (id: string) => {
      handleOptionSelect(id as ImportOption);
    },
    [handleOptionSelect],
  );

  const importOptions = [
    { id: "camera", label: t("addPhoto.camera"), systemImage: "camera" },
    {
      id: "library",
      label: t("addPhoto.library"),
      systemImage: "photo.on.rectangle",
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {recipes.length === 0 ? (
        <EmptyState />
      ) : (
        <RecipeGrid recipes={filteredRecipes} onRecipeTap={handleRecipeTap} />
      )}
      {!popoverVisible && (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardAvoid}
        >
          <View style={styles.bottomBar}>
            <SearchBar
              key={key}
              value={searchTerm}
              onChangeText={setSearchTerm}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
            <AddRecipeButton onPress={showPopover} />
          </View>
        </KeyboardAvoidingView>
      )}
      {popoverVisible && (
        <LiquidGlassPopover
          visible={true}
          options={importOptions}
          onSelect={handleImportOptionSelect}
          onDismiss={dismissPopover}
        />
      )}
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
  keyboardAvoid: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomBar: {
    flexDirection: "row",
    gap: 12,
    // NOTE: The same effective space from the screen to button edges for the `Add note` button in the Apple Notes app
    paddingHorizontal: 28,
    paddingBottom: 28,
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

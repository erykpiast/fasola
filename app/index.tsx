import { router } from "expo-router";
import { LiquidGlassButton, LiquidGlassPopover } from "liquid-glass";
import { Suspense, useCallback, useEffect, type JSX } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDebugContext } from "../features/photo-adjustment/context/DebugContext";
import { EmptyState } from "../features/photos/components/EmptyState";
import { useImportPopover } from "../features/photos/hooks/useImportPopover";
import { AddRecipeButton } from "../features/recipe-form/components/AddRecipeButton";
import { RecipeGrid } from "../features/recipes-list/components/RecipeGrid";
import { useRecipes } from "../features/recipes-list/context/RecipesContext";
import { useGlobalOptions } from "../features/recipes-list/hooks/useGlobalOptions";
import { useRecipeFilter } from "../features/recipes-list/hooks/useRecipeFilter";
import { SearchBar } from "../features/search/components/SearchBar";
import { useSearchFocus } from "../features/search/hooks/useSearchFocus";
import type { RecipeId } from "../lib/types/primitives";
import { useTranslation } from "../platform/i18n/useTranslation";
import { getColors } from "../platform/theme/glassStyles";
import { useTheme } from "../platform/theme/useTheme";

const HEADER_TOP_GAP = 8;
// NOTE: 61 makes the gap above the three global menu button equal to the gap below
const HEADER_ROW_HEIGHT = 61;
const HEADER_BOTTOM_GAP = 8;
const HEADER_AREA_HEIGHT = HEADER_TOP_GAP + HEADER_ROW_HEIGHT + HEADER_BOTTOM_GAP;

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
  const insets = useSafeAreaInsets();
  const { recipes } = useRecipes();
  const { filteredRecipes, searchTerm, setSearchTerm } =
    useRecipeFilter(recipes);
  const { handleFocus, handleBlur, key } = useSearchFocus();
  const { setDebugData } = useDebugContext();

  const {
    showPopover,
    popoverVisible,
    dismissPopover,
    isImporting,
    searchBarStyle,
    buttonStyle,
    importOptions,
    handleImportOptionSelect,
  } = useImportPopover();

  const globalOptions = useGlobalOptions();

  useEffect(() => {
    return () => {
      setDebugData(null);
    };
  }, [setDebugData]);

  const handleRecipeTap = useCallback((id: RecipeId): void => {
    router.push(`/recipe/${id}`);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {recipes.length === 0 ? (
        <EmptyState />
      ) : (
        <RecipeGrid recipes={filteredRecipes} onRecipeTap={handleRecipeTap} headerInset={HEADER_AREA_HEIGHT} />
      )}

      {/* Header row - title + overflow menu button */}
      <Animated.View
        style={[styles.headerRow, { top: insets.top + HEADER_TOP_GAP }, globalOptions.buttonStyle]}
        pointerEvents={popoverVisible || globalOptions.visible ? "none" : "auto"}
      >
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t("library.heading")}
        </Text>
        <LiquidGlassButton
          onPress={globalOptions.handlePress}
          systemImage="ellipsis"
          accessibilityLabel={t("accessibility.moreOptions")}
        />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoid}
      >
        <View style={styles.bottomBar}>
          <Animated.View style={[styles.searchBarWrapper, searchBarStyle]}>
            <SearchBar
              key={key}
              value={searchTerm}
              onChangeText={setSearchTerm}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </Animated.View>
          <Animated.View style={buttonStyle}>
            <AddRecipeButton onPress={showPopover} />
          </Animated.View>
        </View>
      </KeyboardAvoidingView>

      {/* Import popover (bottom trailing) */}
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.popoverLayer,
          !popoverVisible && isImporting && { opacity: 0 },
        ]}
        pointerEvents={popoverVisible ? "auto" : "none"}
      >
        <LiquidGlassPopover
          visible={popoverVisible}
          options={importOptions}
          buttonSize={56}
          onSelect={handleImportOptionSelect}
          onDismiss={dismissPopover}
        />
      </View>

      {/* Overflow popover (top trailing) */}
      <View
        style={[StyleSheet.absoluteFill, styles.popoverLayer]}
        pointerEvents={globalOptions.visible ? "auto" : "none"}
      >
        <LiquidGlassPopover
          visible={globalOptions.visible}
          anchor="topTrailing"
          buttonOffset={{ x: 28, y: insets.top + HEADER_TOP_GAP }}
          options={globalOptions.options}
          buttonSize={48}
          onSelect={globalOptions.handleSelect}
          onDismiss={globalOptions.handleDismiss}
        />
      </View>
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
  headerRow: {
    position: "absolute",
    left: 28,
    right: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
    height: 48,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "bold",
  },
  popoverLayer: {
    zIndex: 11,
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
  searchBarWrapper: {
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

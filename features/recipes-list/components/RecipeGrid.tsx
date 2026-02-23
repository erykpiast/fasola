import { RecipeImageDisplay } from "@/lib/components/atoms/RecipeImageDisplay";
import type { Recipe } from "@/lib/types/recipe";
import type { RecipeId } from "@/lib/types/primitives";
import { FlashList, type ListRenderItemInfo } from "@shopify/flash-list";
import { Suspense, useCallback, useMemo, type JSX } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Dimensions, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");
const COLUMNS = 3;
const SPACING = 2;
const ITEM_SIZE = (width - (COLUMNS - 1) * SPACING) / COLUMNS;

function RecipeItem({
  recipe,
  onTap,
}: {
  recipe: Recipe;
  onTap?: (id: RecipeId) => void;
}): JSX.Element {
  const handlePress = useCallback(() => {
    onTap?.(recipe.id);
  }, [onTap, recipe.id]);

  return (
    <ErrorBoundary fallback={<View style={styles.item} />}>
      <Suspense fallback={<View style={styles.item} />}>
        <Pressable onPress={handlePress}>
          <View style={styles.item}>
            <RecipeImageDisplay
              uri={recipe.thumbnailUri || recipe.photoUri}
              style={styles.image}
            />
          </View>
        </Pressable>
      </Suspense>
    </ErrorBoundary>
  );
}

export function RecipeGrid({
  recipes,
  onRecipeTap,
  headerInset = 0,
}: {
  recipes: Array<Recipe>;
  onRecipeTap?: (id: RecipeId) => void;
  headerInset?: number;
}): JSX.Element {
  const insets = useSafeAreaInsets();

  const contentContainerStyle = useMemo(
    () => ({ ...styles.container, paddingTop: insets.top + headerInset }),
    [insets.top, headerInset]
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Recipe>) => (
      <RecipeItem recipe={item} onTap={onRecipeTap} />
    ),
    [onRecipeTap]
  );

  const keyExtractor = useCallback((item: Recipe) => item.id, []);

  return (
    <FlashList
      data={recipes}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      numColumns={COLUMNS}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 120,
  },
  item: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
    marginRight: SPACING,
    marginBottom: SPACING,
  },
  image: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
  },
});

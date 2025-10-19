import { RecipeImageDisplay } from "@/lib/components/atoms/RecipeImageDisplay";
import { RecipeTitleOverlay } from "@/lib/components/atoms/RecipeTitleOverlay";
import type { Recipe } from "@/lib/types/recipe";
import type { RecipeId } from "@/lib/types/primitives";
import { Suspense, type JSX } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

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
  return (
    <ErrorBoundary fallback={<View style={styles.item} />}>
      <Suspense fallback={<View style={styles.item} />}>
        <Pressable onPress={() => onTap?.(recipe.id)}>
          <View style={styles.item}>
            <RecipeImageDisplay uri={recipe.photoUri} style={styles.image} />
            <RecipeTitleOverlay title={recipe.metadata.title} />
          </View>
        </Pressable>
      </Suspense>
    </ErrorBoundary>
  );
}

export function RecipeGrid({
  recipes,
  onRecipeTap,
}: {
  recipes: Array<Recipe>;
  onRecipeTap?: (id: RecipeId) => void;
}): JSX.Element {
  return (
    <FlatList
      data={recipes}
      renderItem={({ item }) => <RecipeItem recipe={item} onTap={onRecipeTap} />}
      keyExtractor={(item) => item.id}
      numColumns={COLUMNS}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 120,
  },
  row: {
    gap: SPACING,
    marginBottom: SPACING,
  },
  item: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
  },
  image: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
  },
});

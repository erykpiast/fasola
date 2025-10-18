import { RecipeImageDisplay } from "@/lib/components/atoms/RecipeImageDisplay";
import { RecipeTitleOverlay } from "@/lib/components/atoms/RecipeTitleOverlay";
import { Suspense, type JSX } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Photo } from "../types";

const { width } = Dimensions.get("window");
const COLUMNS = 3;
const SPACING = 2;
const ITEM_SIZE = (width - (COLUMNS - 1) * SPACING) / COLUMNS;

interface PhotoGridProps {
  photos: Photo[];
  onPhotoTap?: (id: string) => void;
}

function PhotoItem({
  photo,
  onTap,
}: {
  photo: Photo;
  onTap?: (id: string) => void;
}): JSX.Element {
  return (
    <ErrorBoundary fallback={<View style={styles.item} />}>
      <Suspense fallback={<View style={styles.item} />}>
        <Pressable onPress={() => onTap?.(photo.id)}>
          <View style={styles.item}>
            <RecipeImageDisplay
              uri={photo.uri}
              style={{ width: ITEM_SIZE, height: ITEM_SIZE }}
            />
            <RecipeTitleOverlay title={photo.title} />
          </View>
        </Pressable>
      </Suspense>
    </ErrorBoundary>
  );
}

export function PhotoGrid({
  photos,
  onPhotoTap,
}: PhotoGridProps): JSX.Element {
  return (
    <FlatList
      data={photos}
      renderItem={({ item }) => <PhotoItem photo={item} onTap={onPhotoTap} />}
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
});

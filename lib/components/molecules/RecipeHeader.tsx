import { type JSX } from "react";
import { StyleSheet, View } from "react-native";
import { RecipeImageDisplay } from "../atoms/RecipeImageDisplay";
import { RecipeTitleOverlay } from "../atoms/RecipeTitleOverlay";
import type { PhotoUri } from "@/lib/types/primitives";

interface RecipeHeaderProps {
  photoUri: PhotoUri;
  title?: string;
}

export function RecipeHeader({
  photoUri,
  title,
}: RecipeHeaderProps): JSX.Element {
  return (
    <View style={styles.container}>
      <RecipeImageDisplay uri={photoUri} />
      <RecipeTitleOverlay title={title} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
});

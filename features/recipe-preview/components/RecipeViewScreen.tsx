import { type JSX } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import type { RecipeId } from "@/lib/types/primitives";
import { RecipeHeader } from "@/lib/components/molecules/RecipeHeader";
import { RecipeMetadataDisplay } from "@/lib/components/molecules/RecipeMetadataDisplay";
import { EditButton } from "@/lib/components/atoms/EditButton";
import { useRecipeById } from "../hooks/useRecipeById";

export function RecipeViewScreen({ id }: { id: RecipeId }): JSX.Element | null {
  const recipe = useRecipeById(id);
  const router = useRouter();

  if (!recipe) {
    return null;
  }

  const handleEdit = (): void => {
    router.push(`/recipe/${id}/edit`);
  };

  return (
    <ScrollView style={styles.container}>
      <View>
        <RecipeHeader photoUri={recipe.photoUri} title={recipe.metadata.title} />
        <EditButton onPress={handleEdit} />
      </View>
      <RecipeMetadataDisplay metadata={recipe.metadata} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

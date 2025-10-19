import { EditButton } from "@/lib/components/atoms/EditButton";
import { RecipeHeader } from "@/lib/components/molecules/RecipeHeader";
import { RecipeMetadataDisplay } from "@/lib/components/molecules/RecipeMetadataDisplay";
import type { RecipeId } from "@/lib/types/primitives";
import { useTheme, type Theme } from "@/platform/theme/useTheme";
import { useRouter } from "expo-router";
import { type JSX } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useRecipeById } from "../hooks/useRecipeById";

export function RecipeViewScreen({ id }: { id: RecipeId }): JSX.Element | null {
  const recipe = useRecipeById(id);
  const router = useRouter();
  const theme = useTheme();

  if (!recipe) {
    return null;
  }

  const handleEdit = (): void => {
    router.push(`/recipe/${id}/edit`);
  };

  return (
    <ScrollView style={[styles.container, getThemeColors(theme).container]}>
      <View>
        <RecipeHeader
          photoUri={recipe.photoUri}
          title={recipe.metadata.title}
        />
        <EditButton onPress={handleEdit} />
      </View>
      <RecipeMetadataDisplay metadata={recipe.metadata} />
    </ScrollView>
  );
}

function getThemeColors(theme: Theme) {
  const isDark = theme === "dark";

  return {
    container: {
      backgroundColor: isDark ? "#000000" : "#FFFFFF",
    },
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 2,
  },
});

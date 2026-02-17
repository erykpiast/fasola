import { useDebugContext } from "@/features/photo-adjustment/context/DebugContext";
import { useRecipes } from "@/features/recipes-list/context/RecipesContext";
import { Alert } from "@/lib/alert";
import { BackButton } from "@/lib/components/atoms/BackButton";
import { DeleteButton } from "@/lib/components/atoms/DeleteButton";
import { EditButton } from "@/lib/components/atoms/EditButton";
import { RecipeImageDisplay } from "@/lib/components/atoms/RecipeImageDisplay";
import type { RecipeId } from "@/lib/types/primitives";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { useRouter } from "expo-router";
import { type JSX, useCallback, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useRecipeById } from "../hooks/useRecipeById";
import { MetadataOverlay } from "./MetadataOverlay";
import { ProcessingIndicator } from "./ProcessingIndicator";

export function RecipeViewScreen({ id }: { id: RecipeId }): JSX.Element | null {
  const recipe = useRecipeById(id);
  const router = useRouter();
  const { t } = useTranslation();
  const { setDebugData } = useDebugContext();
  const { deleteRecipe } = useRecipes();

  useEffect(() => {
    return () => {
      setDebugData(null);
    };
  }, [setDebugData]);

  const handleEdit = useCallback((): void => {
    router.push(`/recipe/${id}/edit`);
  }, [router, id]);

  const handleBack = useCallback((): void => {
    router.back();
  }, [router]);

  const handleDelete = useCallback((): void => {
    Alert.alert(t("deleteRecipe.title"), t("deleteRecipe.message"), [
      {
        text: t("deleteRecipe.cancel"),
        style: "cancel",
      },
      {
        text: t("deleteRecipe.confirm"),
        style: "destructive",
        onPress: async () => {
          await deleteRecipe(id);
          router.replace("/");
        },
      },
    ]);
  }, [t, deleteRecipe, id, router]);

  if (!recipe) {
    return null;
  }

  const isProcessing =
    recipe.status === "pending" || recipe.status === "processing";
  const isReady = recipe.status === "ready";

  return (
    <View style={styles.container}>
      <RecipeImageDisplay uri={recipe.photoUri} style={styles.image} />
      <MetadataOverlay metadata={recipe.metadata} />
      {isProcessing && <ProcessingIndicator />}
      <BackButton onPress={handleBack} />
      <DeleteButton onPress={handleDelete} />
      <EditButton onPress={handleEdit} disabled={!isReady} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  image: {
    flex: 1,
  },
});

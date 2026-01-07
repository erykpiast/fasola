import { useDebugContext } from "@/features/photo-adjustment/context/DebugContext";
import {
  ConfirmButton,
  type ConfirmButtonRef,
} from "@/features/recipe-import/components/ConfirmButton";
import { useRecipes } from "@/features/recipes-list/context/RecipesContext";
import { SourceSelector } from "@/features/source-selector/components/SourceSelector";
import { Alert } from "@/lib/alert";
import { BackButton } from "@/lib/components/atoms/BackButton";
import { DeleteButton } from "@/lib/components/atoms/DeleteButton";
import { EditButton } from "@/lib/components/atoms/EditButton";
import { RecipeImageDisplay } from "@/lib/components/atoms/RecipeImageDisplay";
import type { RecipeId } from "@/lib/types/primitives";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { useRouter } from "expo-router";
import { type JSX, useCallback, useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useRecipeById } from "../hooks/useRecipeById";
import { MetadataOverlay } from "./MetadataOverlay";

export function RecipeViewScreen({ id }: { id: RecipeId }): JSX.Element | null {
  const recipe = useRecipeById(id);
  const router = useRouter();
  const { t } = useTranslation();
  const { setDebugData } = useDebugContext();
  const { updateRecipe, updateComplete, deleteRecipe } = useRecipes();
  const confirmButtonRef = useRef<ConfirmButtonRef>(null);

  useEffect(() => {
    return () => {
      setDebugData(null);
    };
  }, [setDebugData]);

  const handleSourceChange = useCallback(
    async (source: string, isAutomatic?: boolean) => {
      if (!recipe) return;

      await updateRecipe(id, {
        ...recipe.metadata,
        source,
      });

      if (isAutomatic) {
        confirmButtonRef.current?.reset();
      } else {
        confirmButtonRef.current?.stop();
      }
    },
    [recipe, id, updateRecipe]
  );

  const handleConfirm = useCallback(async () => {
    if (!recipe || recipe.status === "ready") return;

    await updateComplete(id, recipe.photoUri, recipe.recognizedText, {
      title: recipe.metadata.title,
      source: recipe.metadata.source,
      tags: recipe.metadata.tags,
    });
  }, [recipe, id, updateComplete]);

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

      {isProcessing && (
        <>
          <ActivityIndicator
            size="large"
            color="white"
            style={styles.activityIndicator}
          />
          <View style={styles.bottomBar}>
            <SourceSelector
              value={recipe.metadata.source || ""}
              onValueChange={handleSourceChange}
            />
            <View style={styles.buttonSpacer} />
            <ConfirmButton
              ref={confirmButtonRef}
              onConfirm={handleConfirm}
              disabled={!recipe.metadata.source}
            />
          </View>
        </>
      )}

      {isReady && (
        <>
          <MetadataOverlay metadata={recipe.metadata} />
          <BackButton onPress={handleBack} />
          <DeleteButton onPress={handleDelete} />
          <EditButton onPress={handleEdit} />
        </>
      )}
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
  activityIndicator: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginLeft: -18,
    marginTop: -18,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  buttonSpacer: {
    width: 4,
  },
});

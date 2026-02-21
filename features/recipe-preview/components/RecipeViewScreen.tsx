import { DebugVisualization } from "@/features/photo-adjustment/components/DebugVisualization";
import { useDebugContext } from "@/features/photo-adjustment/context/DebugContext";
import { useRecipes } from "@/features/recipes-list/context/RecipesContext";
import { Alert } from "@/lib/alert";
import { BackButton } from "@/lib/components/atoms/BackButton";
import { DeleteButton } from "@/lib/components/atoms/DeleteButton";
import { EditButton } from "@/lib/components/atoms/EditButton";
import { ProgressiveImage } from "@/lib/components/atoms/ProgressiveImage";
import { ZoomableImage } from "@/lib/components/atoms/ZoomableImage";
import { useImageCoverSize } from "@/lib/hooks/useImageCoverSize";
import type { RecipeId } from "@/lib/types/primitives";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { useRouter } from "expo-router";
import { type JSX, useCallback, useEffect, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
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

  const [isZoomed, setIsZoomed] = useState(false);
  const { width, height } = useWindowDimensions();
  const { coverSize, onImageLoad } = useImageCoverSize(width, height);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isZoomed ? 0 : 1, { duration: 200 }),
  }));

  if (!recipe) {
    return null;
  }

  const isProcessing =
    recipe.status === "pending" || recipe.status === "processing";
  const isReady = recipe.status === "ready";

  return (
    <View style={styles.container}>
      <ZoomableImage
        style={{ width, height }}
        onZoomChange={setIsZoomed}
      >
        <ProgressiveImage
          uri={recipe.photoUri}
          thumbnailUri={recipe.thumbnailUri}
          style={coverSize ?? { width, height }}
          onLoad={onImageLoad}
        />
      </ZoomableImage>
      <Animated.View
        style={[styles.overlay, overlayStyle]}
        pointerEvents={isZoomed ? "none" : "box-none"}
      >
        <View pointerEvents="none">
          <MetadataOverlay metadata={recipe.metadata} />
          {isProcessing && <ProcessingIndicator />}
          <DebugVisualization />
        </View>
        <BackButton onPress={handleBack} />
        <DeleteButton onPress={handleDelete} />
        <EditButton onPress={handleEdit} disabled={!isReady} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
});

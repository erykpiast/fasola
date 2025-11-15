import { useDebugContext } from "@/features/photo-adjustment/context/DebugContext";
import { usePhotoAdjustment } from "@/features/photo-adjustment/hooks/usePhotoAdjustment";
import { AddRecipeForm } from "@/features/recipe-form/components/AddRecipeForm";
import { useRecipes } from "@/features/recipes-list/context/RecipesContext";
import { Alert } from "@/lib/alert";
import type { PhotoUri } from "@/lib/types/primitives";
import type { RecipeMetadata } from "@/lib/types/recipe";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { useTheme, type Theme } from "@/platform/theme/useTheme";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState, type JSX } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AddRecipeScreen(): JSX.Element {
  const { uri: originalUri } = useLocalSearchParams<{
    uri: PhotoUri;
  }>();
  const { addRecipe } = useRecipes();
  const theme = useTheme();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processedUri, setProcessedUri] = useState<PhotoUri | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);
  const { setDebugData } = useDebugContext();
  const { processPhoto } = usePhotoAdjustment();

  useEffect(() => {
    if (originalUri) {
      processPhoto(originalUri).then((result) => {
        if (result.success && result.processedUri) {
          setProcessedUri(result.processedUri as PhotoUri);
        }
        setIsProcessing(false);
      });
    }
  }, [originalUri, processPhoto]);

  useEffect(() => {
    return () => {
      setDebugData(null);
    };
  }, [setDebugData]);

  const handleSubmit = useCallback(
    async (metadata: RecipeMetadata) => {
      const uri = processedUri || originalUri;
      if (!uri || isSubmitting) return;

      setIsSubmitting(true);
      try {
        await addRecipe(uri, metadata);
        router.back();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        Alert.alert(t("errors.saveFailed"), errorMessage);
      } finally {
        setIsSubmitting(false);
      }
    },
    [processedUri, originalUri, addRecipe, isSubmitting, t]
  );

  if (!originalUri) {
    return (
      <SafeAreaView
        style={[styles.container, getThemeColors(theme).container]}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.container, getThemeColors(theme).container]}>
      <AddRecipeForm
        photoUri={processedUri || originalUri}
        onSubmit={handleSubmit}
        isProcessing={isProcessing}
      />
    </SafeAreaView>
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
  },
});

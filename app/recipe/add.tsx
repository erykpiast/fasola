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
  const { uri } = useLocalSearchParams<{ uri: PhotoUri }>();
  const { addRecipe } = useRecipes();
  const theme = useTheme();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { processPhoto, isProcessing } = usePhotoAdjustment();
  const [displayUri, setDisplayUri] = useState<PhotoUri>(uri);
  const [recognizedText, setRecognizedText] = useState<string | undefined>();

  useEffect(() => {
    if (!uri) return;

    const processImage = async (): Promise<void> => {
      const result = await processPhoto(uri);
      if (result.success && result.processedUri) {
        setDisplayUri(result.processedUri as PhotoUri);
      }

      if (result.ocrResult?.success && result.ocrResult.text) {
        console.log("[AddRecipe] OCR extracted text:", result.ocrResult.text);
        setRecognizedText(result.ocrResult.text);
      }
    };

    processImage();
  }, [uri, processPhoto]);

  const handleSubmit = useCallback(
    async (metadata: RecipeMetadata) => {
      if (!displayUri || isSubmitting) return;

      setIsSubmitting(true);
      try {
        await addRecipe(displayUri, metadata, recognizedText);
        router.back();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        Alert.alert(t("errors.saveFailed"), errorMessage);
      } finally {
        setIsSubmitting(false);
      }
    },
    [displayUri, addRecipe, isSubmitting, recognizedText, t]
  );

  if (!uri || !displayUri) {
    return (
      <SafeAreaView
        style={[styles.container, getThemeColors(theme).container]}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.container, getThemeColors(theme).container]}>
      <AddRecipeForm
        photoUri={displayUri}
        isProcessing={isProcessing}
        onSubmit={handleSubmit}
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

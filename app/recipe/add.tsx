import { useBackgroundProcessing } from "@/features/background-processing";
import { AddRecipeForm } from "@/features/recipe-form/components/AddRecipeForm";
import { useRecipes } from "@/features/recipes-list/context/RecipesContext";
import { sourceHistoryRepository } from "@/lib/repositories/sourceHistory";
import type { PhotoUri } from "@/lib/types/primitives";
import { useTheme, type Theme } from "@/platform/theme/useTheme";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState, type JSX } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AddRecipeScreen(): JSX.Element {
  const theme = useTheme();
  const { uri } = useLocalSearchParams<{ uri: PhotoUri }>();
  const [source, setSource] = useState("");
  const { savePending } = useRecipes();
  const { addToQueue } = useBackgroundProcessing();

  const handleSourceChange = useCallback(
    (newSource: string) => {
      setSource(newSource);
    },
    []
  );

  const handleConfirm = useCallback(
    async (sourceOverride?: string) => {
      const effectiveSource = sourceOverride ?? source;
      if (!uri || !effectiveSource) {
        return;
      }

      const recipe = await savePending(uri, effectiveSource);
      await sourceHistoryRepository.addSource(effectiveSource);
      addToQueue(recipe.id);
      router.replace("/");
    },
    [uri, source, savePending, addToQueue]
  );

  if (!uri) {
    return (
      <SafeAreaView
        edges={["top", "left", "right"]}
        style={[styles.container, getThemeColors(theme).container]}
      />
    );
  }

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.container, getThemeColors(theme).container]}
    >
      <AddRecipeForm
        photoUri={uri}
        source={source}
        onSourceChange={handleSourceChange}
        onConfirm={handleConfirm}
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

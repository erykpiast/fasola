import { useBackgroundProcessing } from "@/features/background-processing";
import { AddRecipeForm } from "@/features/recipe-form/components/AddRecipeForm";
import { type ConfirmButtonRef } from "@/features/recipe-import/components/ConfirmButton";
import { useRecipes } from "@/features/recipes-list/context/RecipesContext";
import { sourceHistoryRepository } from "@/lib/repositories/sourceHistory";
import type { PhotoUri } from "@/lib/types/primitives";
import { useTheme, type Theme } from "@/platform/theme/useTheme";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState, type JSX } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AddRecipeScreen(): JSX.Element {
  const theme = useTheme();
  const { uri } = useLocalSearchParams<{ uri: PhotoUri }>();
  const [source, setSource] = useState("");
  const confirmButtonRef = useRef<ConfirmButtonRef>(null);
  const hasInteractedWithSelector = useRef(false);
  const { savePending } = useRecipes();
  const { addToQueue } = useBackgroundProcessing();

  const handleSelectorInteraction = useCallback(() => {
    hasInteractedWithSelector.current = true;
    confirmButtonRef.current?.stop();
  }, []);

  const handleSourceChange = useCallback(
    (newSource: string, isAutomatic?: boolean) => {
      setSource(newSource);
      if (isAutomatic && !hasInteractedWithSelector.current) {
        confirmButtonRef.current?.reset();
      } else {
        confirmButtonRef.current?.stop();
      }
    },
    []
  );

  const handleConfirm = useCallback(async () => {
    if (!uri || !source) {
      return;
    }

    const recipe = await savePending(uri, source);
    await sourceHistoryRepository.addSource(source);
    addToQueue(recipe.id);
    router.replace("/");
  }, [uri, source, savePending, addToQueue]);

  if (!uri) {
    return (
      <SafeAreaView
        style={[styles.container, getThemeColors(theme).container]}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.container, getThemeColors(theme).container]}>
      <AddRecipeForm
        photoUri={uri}
        source={source}
        onSourceChange={handleSourceChange}
        onSelectorInteraction={handleSelectorInteraction}
        confirmButtonRef={confirmButtonRef as React.RefObject<ConfirmButtonRef>}
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

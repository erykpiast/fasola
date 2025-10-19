import { Stack } from "expo-router";
import * as SystemUI from "expo-system-ui";
import { Suspense, useEffect, type JSX } from "react";
import "../platform/i18n/config";
import { useTheme } from "../platform/theme/useTheme";
import { RecipesProvider } from "@/features/recipes-list/context/RecipesContext";
import { StyleSheet, View } from "react-native";

export default function RootLayout(): JSX.Element {
  const theme = useTheme();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme === "dark" ? "#000000" : "#F5F5F5");
  }, [theme]);

  return (
    <Suspense fallback={<View style={styles.suspenseFallback} />}>
      <RecipesProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </RecipesProvider>
    </Suspense>
  );
}

const styles = StyleSheet.create({
  suspenseFallback: {
    flex: 1,
  },
});

import { DebugProvider } from "@/features/photo-adjustment/context/DebugContext";
import { RecipesProvider } from "@/features/recipes-list/context/RecipesContext";
import { OpenCVWebViewSetup } from "@/lib/photo-processor/OpenCVWebViewSetup";
import { Stack } from "expo-router";
import * as SystemUI from "expo-system-ui";
import { Suspense, useEffect, type JSX } from "react";
import { StyleSheet, View } from "react-native";
import "../platform/i18n/config";
import { useTheme } from "../platform/theme/useTheme";

export default function RootLayout(): JSX.Element {
  const theme = useTheme();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme === "dark" ? "#000000" : "#F5F5F5");
  }, [theme]);

  return (
    <Suspense fallback={<View style={styles.suspenseFallback} />}>
      <DebugProvider>
        <RecipesProvider>
          <OpenCVWebViewSetup />
          <Stack screenOptions={{ headerShown: false }} />
        </RecipesProvider>
      </DebugProvider>
    </Suspense>
  );
}

const styles = StyleSheet.create({
  suspenseFallback: {
    flex: 1,
  },
});

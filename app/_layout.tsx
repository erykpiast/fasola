import { BackgroundProcessingProvider } from "@/features/background-processing";
import { ICloudSyncProvider } from "@/features/icloud-sync";
import { DebugProvider } from "@/features/photo-adjustment/context/DebugContext";
import { usePhotoAdjustment } from "@/features/photo-adjustment/hooks/usePhotoAdjustment";
import { RecipesProvider } from "@/features/recipes-list/context/RecipesContext";
import { Stack } from "expo-router";
import * as SystemUI from "expo-system-ui";
import { Suspense, useEffect, type JSX } from "react";
import { StyleSheet, View } from "react-native";
import "../platform/i18n/config";
import { useTheme } from "../platform/theme/useTheme";

export default function RootLayout(): JSX.Element {
  const theme = useTheme();
  const { WebViewSetup } = usePhotoAdjustment();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme === "dark" ? "#000000" : "#F5F5F5");
  }, [theme]);

  return (
    <Suspense fallback={<View style={styles.suspenseFallback} />}>
      <DebugProvider>
        <RecipesProvider>
          <ICloudSyncProvider>
            <BackgroundProcessingProvider>
              <Stack screenOptions={{ headerShown: false }} />
              <WebViewSetup />
            </BackgroundProcessingProvider>
          </ICloudSyncProvider>
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

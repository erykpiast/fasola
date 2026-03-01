import { BackgroundProcessingProvider } from "@/features/background-processing";
import { ICloudSyncProvider } from "@/features/icloud-sync";
import { DebugProvider } from "@/features/photo-adjustment/context/DebugContext";
import { usePhotoAdjustment } from "@/features/photo-adjustment/hooks/usePhotoAdjustment";
import { RecipesProvider } from "@/features/recipes-list/context/RecipesContext";
import { SourcesProvider } from "@/features/sources/context/SourcesContext";
import { TagsProvider } from "@/features/tags/context/TagsContext";
import { Stack } from "expo-router";
import * as SystemUI from "expo-system-ui";
import { Suspense, useEffect, type JSX } from "react";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "../platform/i18n/config";
import { useTheme } from "../platform/theme/useTheme";

export default function RootLayout(): JSX.Element {
  const theme = useTheme();
  const { WebViewSetup } = usePhotoAdjustment();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme === "dark" ? "#000000" : "#F5F5F5");
  }, [theme]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <Suspense fallback={<View style={styles.suspenseFallback} />}>
        <DebugProvider>
          <SourcesProvider>
            <TagsProvider>
              <RecipesProvider>
                <ICloudSyncProvider>
                  <BackgroundProcessingProvider>
                    <Stack screenOptions={{ headerShown: false }} />
                    <WebViewSetup />
                  </BackgroundProcessingProvider>
                </ICloudSyncProvider>
              </RecipesProvider>
            </TagsProvider>
          </SourcesProvider>
        </DebugProvider>
      </Suspense>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  suspenseFallback: {
    flex: 1,
  },
});

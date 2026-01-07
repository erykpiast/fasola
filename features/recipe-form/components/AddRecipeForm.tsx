import {
  ConfirmButton,
  type ConfirmButtonRef,
} from "@/features/recipe-import/components/ConfirmButton";
import { SourceSelector } from "@/features/source-selector/components/SourceSelector";
import { Alert } from "@/lib/alert";
import type { PhotoUri } from "@/lib/types/primitives";
import { LiquidGlassButton } from "@/modules/liquid-glass";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { useTheme, type Theme } from "@/platform/theme/useTheme";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, type JSX } from "react";
import { Platform, StyleSheet, View } from "react-native";

export function AddRecipeForm({
  photoUri,
  source,
  onSourceChange,
  onSelectorInteraction,
  confirmButtonRef,
  onConfirm,
}: {
  photoUri: PhotoUri;
  source: string;
  onSourceChange: (source: string, isAutomatic?: boolean) => void;
  onSelectorInteraction?: () => void;
  confirmButtonRef: React.RefObject<ConfirmButtonRef>;
  onConfirm: () => void;
}): JSX.Element {
  const theme = useTheme();
  const { t } = useTranslation();

  const handleClose = useCallback(() => {
    confirmButtonRef.current?.stop();
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    Alert.alert(
      t("recipeForm.discardChanges.title"),
      t("recipeForm.discardChanges.message"),
      [
        { text: t("recipeForm.discardChanges.cancel"), style: "cancel" },
        {
          text: t("recipeForm.discardChanges.discard"),
          style: "destructive",
          onPress: () => {
            if (Platform.OS !== "web") {
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Warning
              );
            }
            router.back();
          },
        },
      ]
    );
  }, [confirmButtonRef, t]);

  return (
    <View style={[styles.container, getThemeColors(theme).container]}>
      <View style={styles.processingContainer}>
        <Image
          source={{ uri: photoUri }}
          style={styles.processingImage}
          contentFit="cover"
        />
        <View style={styles.processingBottomBar}>
          <LiquidGlassButton
            onPress={handleClose}
            accessibilityLabel={t("accessibility.close")}
            systemImage="xmark"
          />
          <SourceSelector
            value={source}
            onValueChange={onSourceChange}
            onInteraction={onSelectorInteraction}
          />
          <ConfirmButton
            ref={confirmButtonRef}
            onConfirm={onConfirm}
            disabled={!source}
          />
        </View>
      </View>
    </View>
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
  processingContainer: {
    flex: 1,
    position: "relative",
  },
  processingImage: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  processingBottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
});

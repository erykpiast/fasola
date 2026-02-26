import { ConfirmButton } from "@/features/recipe-import/components/ConfirmButton";
import {
  SourceSelector,
  type SourceSelectorRef,
} from "@/features/source-selector/components/SourceSelector";
import { Alert } from "@/lib/alert";
import type { PhotoUri, SourceId } from "@/lib/types/primitives";
import { LiquidGlassButton } from "@/modules/liquid-glass";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { useTheme, type Theme } from "@/platform/theme/useTheme";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useRef, useState, type JSX } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";

export function AddRecipeForm({
  photoUri,
  source,
  onSourceChange,
  onConfirm,
}: {
  photoUri: PhotoUri;
  source: SourceId;
  onSourceChange: (sourceId: SourceId, isAutomatic?: boolean) => void;
  onConfirm: (sourceOverride?: SourceId) => void;
}): JSX.Element {
  const theme = useTheme();
  const { t } = useTranslation();
  const sourceSelectorRef = useRef<SourceSelectorRef>(null);
  const [isEditingSource, setIsEditingSource] = useState(false);

  const handleEditingChange = useCallback((editing: boolean) => {
    setIsEditingSource(editing);
  }, []);

  const handleClose = useCallback(() => {
    if (isEditingSource) {
      const cancelled = sourceSelectorRef.current?.cancelEdit();
      if (cancelled) return;
    }
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
  }, [isEditingSource, t]);

  const handleConfirm = useCallback(async () => {
    if (isEditingSource) {
      const confirmed = await sourceSelectorRef.current?.confirmNewSource();
      if (!confirmed) return;
      onConfirm(confirmed);
      return;
    }
    if (!source) return;
    onConfirm();
  }, [isEditingSource, source, onConfirm]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, getThemeColors(theme).container]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
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
            ref={sourceSelectorRef}
            value={source}
            onValueChange={onSourceChange}
            onEditingChange={handleEditingChange}
          />
          <ConfirmButton
            onConfirm={handleConfirm}
            disabled={!isEditingSource && !source}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
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
    paddingBottom: 27,
  },
});

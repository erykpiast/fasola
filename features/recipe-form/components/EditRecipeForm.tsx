import { Alert } from "@/lib/alert";
import { RecipeImageDisplay } from "@/lib/components/atoms/RecipeImageDisplay";
import { ZoomableImage } from "@/lib/components/atoms/ZoomableImage";
import { useImageCoverSize } from "@/lib/hooks/useImageCoverSize";
import { useTags } from "@/features/tags/context/TagsContext";
import { resolveTagLabels } from "@/features/tags/utils/resolveRecipeTags";
import type { RecipeMetadataWrite } from "@/lib/repositories/types";
import type { Recipe } from "@/lib/types/recipe";
import { LiquidGlassButton } from "@/modules/liquid-glass";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { getColors } from "@/platform/theme/glassStyles";
import { useTheme } from "@/platform/theme/useTheme";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { type JSX, useCallback, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useRecipeForm } from "../hooks/useRecipeForm";
import { MetadataFormFields } from "./MetadataFormFields";

export function EditRecipeForm({
  recipe,
  onSubmit,
}: {
  recipe: Recipe;
  onSubmit: (metadata: RecipeMetadataWrite) => void;
}): JSX.Element {
  const theme = useTheme();
  const colors = getColors(theme);
  const { t } = useTranslation();
  const { tagLookup } = useTags();
  const scrollViewRef = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();
  const [isZoomed, setIsZoomed] = useState(false);
  const { coverSize, onImageLoad } = useImageCoverSize(width, width);
  const resolvedInitialTags = resolveTagLabels(recipe.metadata.tagIds, tagLookup);
  const { values, handleChange, handleSubmit, isDirty } = useRecipeForm({
    initialValues: {
      title: recipe.metadata.title,
      source: recipe.metadata.source,
      tags: resolvedInitialTags,
      tagIds: recipe.metadata.tagIds,
    },
    onSubmit,
  });

  const handleBack = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.back();
  }, []);

  const handleDiscard = useCallback(() => {
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
  }, [t]);

  const handleFormSubmit = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    handleSubmit();
  }, [handleSubmit]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!isZoomed}
      >
        <View style={styles.imageContainer}>
          <ZoomableImage
            style={{ width, height: width }}
            onZoomChange={setIsZoomed}
            maxScale={3}
          >
            <RecipeImageDisplay
              uri={recipe.photoUri}
              style={coverSize ?? { width, height: width }}
              onLoad={onImageLoad}
            />
          </ZoomableImage>
        </View>

        <View style={styles.formContainer}>
          <MetadataFormFields
            value={values}
            onChange={handleChange}
            scrollViewRef={scrollViewRef}
          />
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        {isDirty ? (
          <LiquidGlassButton
            onPress={handleDiscard}
            accessibilityLabel={t("accessibility.close")}
            systemImage="xmark"
          />
        ) : (
          <LiquidGlassButton
            onPress={handleBack}
            accessibilityLabel={t("accessibility.back")}
            systemImage="chevron.left"
          />
        )}

        <View style={{ flex: 1 }} />

        <LiquidGlassButton
          onPress={handleFormSubmit}
          accessibilityLabel={t("recipeForm.submitEdit")}
          systemImage="checkmark"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 100,
  },
  imageContainer: {
    position: "relative",
    overflow: "hidden",
  },
  formContainer: {
    padding: 24,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingBottom: 28,
  },
});

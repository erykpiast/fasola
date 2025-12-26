import { useTextRecognition } from "@/features/text-recognition/context/TextRecognitionContext";
import { Alert } from "@/lib/alert";
import { CloseButton } from "@/lib/components/atoms/CloseButton";
import { RecipeImageDisplay } from "@/lib/components/atoms/RecipeImageDisplay";
import type { PhotoUri } from "@/lib/types/primitives";
import type { RecipeMetadata } from "@/lib/types/recipe";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { useTheme, type Theme } from "@/platform/theme/useTheme";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, type JSX } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRecipeForm } from "../hooks/useRecipeForm";
import { MetadataFormFields } from "./MetadataFormFields";
import { ProcessingOverlay } from "./ProcessingOverlay";

export function AddRecipeForm({
  photoUri,
  isProcessing = false,
  onSubmit,
}: {
  photoUri: PhotoUri;
  isProcessing?: boolean;
  onSubmit: (metadata: RecipeMetadata) => void;
}): JSX.Element {
  const theme = useTheme();
  const { t } = useTranslation();
  const scrollViewRef = useRef<ScrollView>(null);
  const { classificationResult } = useTextRecognition();
  const { values, handleChange, handleSubmit, isDirty, updateFromExtraction } =
    useRecipeForm({
      onSubmit,
    });

  const handleClose = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (isDirty) {
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
    } else {
      router.back();
    }
  }, [isDirty, t]);

  const handleFormSubmit = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    handleSubmit();
  }, [handleSubmit]);

  // Auto-populate form fields from classification results
  useEffect(() => {
    if (classificationResult) {
      const suggestedTags = classificationResult.suggestions
        .filter((s) => s.confidence >= 0.8)
        .map((s) => s.tag);

      updateFromExtraction(classificationResult.title, suggestedTags);
    }
  }, [classificationResult, updateFromExtraction]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, getThemeColors(theme).container]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.imageContainer}>
          <RecipeImageDisplay uri={photoUri} />
          {isProcessing && <ProcessingOverlay />}
          <CloseButton onPress={handleClose} />
        </View>

        <View style={styles.formContainer}>
          <MetadataFormFields
            value={values}
            onChange={handleChange}
            scrollViewRef={scrollViewRef}
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, getThemeColors(theme).footer]}>
        <Pressable
          onPress={handleFormSubmit}
          style={[styles.submitButton, getThemeColors(theme).submitButton]}
          accessibilityLabel={t("recipeForm.submit")}
          accessibilityRole="button"
        >
          <Text
            style={[styles.submitButtonText, getThemeColors(theme).buttonText]}
          >
            {t("recipeForm.submit")}
          </Text>
        </Pressable>
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
    footer: {
      backgroundColor: isDark ? "#000000" : "#FFFFFF",
    },
    submitButton: {
      backgroundColor: isDark ? "#FFFFFF" : "#000000",
    },
    buttonText: {
      color: isDark ? "#000000" : "#FFFFFF",
    },
  };
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
  },
  formContainer: {
    padding: 24,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    paddingBottom: 40,
  },
  submitButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: "center",
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: "600",
  },
});

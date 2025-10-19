import { type JSX, useCallback, useRef } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import type { Recipe, RecipeMetadata } from "@/lib/types/recipe";
import { RecipeImageDisplay } from "@/lib/components/atoms/RecipeImageDisplay";
import { CloseButton } from "@/lib/components/atoms/CloseButton";
import { MetadataFormFields } from "./MetadataFormFields";
import { useRecipeForm } from "../hooks/useRecipeForm";
import { useTheme, type Theme } from "@/platform/theme/useTheme";
import { useTranslation } from "@/platform/i18n/useTranslation";

export function EditRecipeForm({
  recipe,
  onSubmit,
}: {
  recipe: Recipe;
  onSubmit: (metadata: RecipeMetadata) => void;
}): JSX.Element {
  const theme = useTheme();
  const { t } = useTranslation();
  const scrollViewRef = useRef<ScrollView>(null);
  const { values, handleChange, handleSubmit, isDirty } = useRecipeForm({
    initialValues: recipe.metadata,
    onSubmit,
  });

  const handleClose = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (isDirty) {
      if (Platform.OS === "web") {
        const confirmed = window.confirm(
          `${t("recipeForm.discardChanges.title")}\n\n${t("recipeForm.discardChanges.message")}`
        );
        if (confirmed) {
          router.back();
        }
      } else {
        Alert.alert(
          t("recipeForm.discardChanges.title"),
          t("recipeForm.discardChanges.message"),
          [
            { text: t("recipeForm.discardChanges.cancel"), style: "cancel" },
            {
              text: t("recipeForm.discardChanges.discard"),
              style: "destructive",
              onPress: () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                router.back();
              },
            },
          ],
        );
      }
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
          <RecipeImageDisplay uri={recipe.photoUri} />
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
          accessibilityLabel={t("recipeForm.submitEdit")}
          accessibilityRole="button"
        >
          <Text
            style={[styles.submitButtonText, getThemeColors(theme).buttonText]}
          >
            {t("recipeForm.submitEdit")}
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

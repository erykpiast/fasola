import { type JSX, useCallback, useRef } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import type { Recipe, RecipeMetadata } from "@/lib/types/recipe";
import { RecipeImageDisplay } from "@/lib/components/atoms/RecipeImageDisplay";
import { MetadataFormFields } from "./MetadataFormFields";
import { useRecipeForm } from "../hooks/useRecipeForm";
import { useTheme } from "@/platform/theme/useTheme";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { Alert } from "@/lib/alert";
import { GlassView } from "expo-glass-effect";
import { getColors } from "@/platform/theme/glassStyles";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";

export function EditRecipeForm({
  recipe,
  onSubmit,
}: {
  recipe: Recipe;
  onSubmit: (metadata: RecipeMetadata) => void;
}): JSX.Element {
  const theme = useTheme();
  const colors = getColors(theme);
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
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              }
              router.back();
            },
          },
        ],
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
      >
        <View style={styles.imageContainer}>
          <RecipeImageDisplay uri={recipe.photoUri} />
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
        <Pressable
          onPress={handleClose}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          accessibilityLabel={t("accessibility.close")}
          accessibilityRole="button"
        >
          <GlassView style={styles.buttonContent}>
            <MaterialIcons name="close" size={24} color={colors.text} />
          </GlassView>
        </Pressable>

        <View style={{ flex: 1 }} />

        <Pressable
          onPress={handleFormSubmit}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          accessibilityLabel={t("recipeForm.submitEdit")}
          accessibilityRole="button"
        >
          <GlassView style={styles.buttonContent}>
            <Ionicons name="checkmark" size={28} color={colors.text} />
          </GlassView>
        </Pressable>
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
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  buttonContent: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
});

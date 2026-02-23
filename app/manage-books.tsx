import { useRecipes } from "@/features/recipes-list/context/RecipesContext";
import { useSources } from "@/features/sources/context/SourcesContext";
import { Alert } from "@/lib/alert";
import type { SourceId } from "@/lib/types/primitives";
import type { Source } from "@/lib/types/source";
import { isUrl } from "@/lib/utils/recipeValidation";
import { LiquidGlassButton, LiquidGlassInput } from "@/modules/liquid-glass";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { getColors } from "@/platform/theme/glassStyles";
import { useTheme } from "@/platform/theme/useTheme";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import {
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  type SharedValue,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function useActionButtonScale(
  translateX: SharedValue<number>,
  sign: 1 | -1
): { transform: Array<{ scale: number }>; opacity: number } {
  return useAnimatedStyle(() => {
    const w = Math.max(sign * translateX.value - BUTTON_GAP, 0);
    if (w <= SCALE_MIN_WIDTH) {
      return { transform: [{ scale: 0 }], opacity: 0 };
    }
    if (w < BUTTON_SCALE_THRESHOLD) {
      const s =
        (w - SCALE_MIN_WIDTH) / (BUTTON_SCALE_THRESHOLD - SCALE_MIN_WIDTH);
      return { transform: [{ scale: s }], opacity: s };
    }
    return { transform: [{ scale: 1 }], opacity: 1 };
  });
}

const SWIPE_THRESHOLD = 60;
const ACTION_BUTTON_WIDTH = 80;
const BUTTON_GAP = 12;
const BUTTON_CONTENT_WIDTH = ACTION_BUTTON_WIDTH - BUTTON_GAP;
const BUTTON_SCALE_THRESHOLD = BUTTON_CONTENT_WIDTH;
const SCALE_MIN_WIDTH = 10;

function SwipeableBookRow({
  source,
  recipeCount,
  editingSourceId,
  onDelete,
  onStartEdit,
  onConfirmEdit,
  onCancelEdit,
  editText,
  onEditTextChange,
}: {
  source: Source;
  recipeCount: number;
  editingSourceId: SourceId | null;
  onDelete: (sourceId: SourceId) => void;
  onStartEdit: (sourceId: SourceId) => void;
  onConfirmEdit: () => void;
  onCancelEdit: () => void;
  editText: string;
  onEditTextChange: (text: string) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const colors = getColors(theme);
  const isDark = theme === "dark";
  const textColor = isDark ? "#FFFFFF" : "#000000";
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const isEditing = editingSourceId === source.id;
  const isEditingShared = useSharedValue(isEditing);

  isEditingShared.value = isEditing;

  useEffect(() => {
    translateX.value = withSpring(isEditing ? ACTION_BUTTON_WIDTH : 0);
  }, [isEditing, translateX]);

  const triggerDelete = useCallback(() => {
    translateX.value = withSpring(0);
    onDelete(source.id);
  }, [source.id, onDelete, translateX]);

  const handleEditPress = useCallback(() => {
    if (isEditing) {
      onConfirmEdit();
    } else {
      onStartEdit(source.id);
    }
  }, [isEditing, onConfirmEdit, onStartEdit, source.id]);

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onStart(() => {
      startX.value = translateX.value;
    })
    .onUpdate((event) => {
      const raw = startX.value + event.translationX;
      const limit = ACTION_BUTTON_WIDTH * 1.5;
      translateX.value = Math.max(-limit, Math.min(limit, raw));
    })
    .onEnd(() => {
      if (isEditingShared.value) {
        if (translateX.value < SWIPE_THRESHOLD / 2) {
          translateX.value = withSpring(0);
          runOnJS(onCancelEdit)();
        } else {
          translateX.value = withSpring(ACTION_BUTTON_WIDTH);
        }
      } else {
        if (translateX.value < -SWIPE_THRESHOLD) {
          translateX.value = withSpring(-ACTION_BUTTON_WIDTH);
        } else if (translateX.value > SWIPE_THRESHOLD) {
          translateX.value = withSpring(ACTION_BUTTON_WIDTH);
        } else {
          translateX.value = withSpring(0);
        }
      }
    });

  const tap = Gesture.Tap().onEnd(() => {
    if (Math.abs(translateX.value) > 10 && !isEditingShared.value) {
      translateX.value = withSpring(0);
    }
  });

  const gesture = Gesture.Race(pan, tap);

  const contentAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const contentBgStyle = useAnimatedStyle(() => {
    const absX = Math.abs(translateX.value);
    const progress = Math.min(absX / SWIPE_THRESHOLD, 1);
    const bgColor = interpolateColor(
      progress,
      [0, 1],
      isDark
        ? ["rgba(44,43,45,0)", "#2c2b2d"]
        : ["rgba(128,128,128,0)", "rgba(128,128,128,0.12)"]
    );
    return {
      backgroundColor: bgColor,
      borderRadius: interpolate(progress, [0, 1], [0, 21]),
    };
  });

  const editButtonWidthStyle = useAnimatedStyle(() => ({
    width: translateX.value > BUTTON_GAP ? translateX.value - BUTTON_GAP : 0,
    opacity: translateX.value > BUTTON_GAP ? 1 : 0,
  }));

  const deleteButtonWidthStyle = useAnimatedStyle(() => ({
    width: -translateX.value > BUTTON_GAP ? -translateX.value - BUTTON_GAP : 0,
    opacity: -translateX.value > BUTTON_GAP ? 1 : 0,
  }));

  const editScaleStyle = useActionButtonScale(translateX, 1);
  const deleteScaleStyle = useActionButtonScale(translateX, -1);

  return (
    <View style={styles.rowContainer}>
      {/* Edit button - left */}
      <Animated.View
        style={[
          styles.actionButtonContainer,
          styles.editButtonContainer,
          editButtonWidthStyle,
        ]}
      >
        <Pressable
          onPress={handleEditPress}
          style={styles.actionButtonPressable}
          accessibilityRole="button"
          accessibilityLabel={
            isEditing
              ? t("manageBooks.confirmEditAction")
              : t("manageBooks.editAction")
          }
        >
          <Animated.View style={[styles.actionButtonContent, editScaleStyle]}>
            <View style={[styles.actionButtonIcon, styles.editButtonColor]}>
              <MaterialIcons
                name={isEditing ? "check" : "edit"}
                size={26}
                color="#FFFFFF"
              />
            </View>
            <Text numberOfLines={1} style={[styles.actionButtonLabel, { color: colors.textSecondary }]}>
              {isEditing
                ? t("manageBooks.confirmEditAction")
                : t("manageBooks.editAction")}
            </Text>
          </Animated.View>
        </Pressable>
      </Animated.View>

      {/* Delete button - right */}
      <Animated.View
        style={[
          styles.actionButtonContainer,
          styles.deleteButtonContainer,
          deleteButtonWidthStyle,
        ]}
      >
        <Pressable
          onPress={triggerDelete}
          style={styles.actionButtonPressable}
          accessibilityRole="button"
          accessibilityLabel={t("manageBooks.deleteConfirmAction")}
        >
          <Animated.View style={[styles.actionButtonContent, deleteScaleStyle]}>
            <View style={[styles.actionButtonIcon, styles.deleteButtonColor]}>
              <MaterialIcons name="delete" size={26} color="#FFFFFF" />
            </View>
            <Text numberOfLines={1} style={[styles.actionButtonLabel, { color: colors.textSecondary }]}>
              {t("manageBooks.deleteConfirmAction")}
            </Text>
          </Animated.View>
        </Pressable>
      </Animated.View>

      {/* Content */}
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.listItem, contentAnimStyle, contentBgStyle]}>
          {isEditing ? (
            <>
              <TextInput
                style={[styles.editInput, { color: textColor }]}
                value={editText}
                onChangeText={onEditTextChange}
                maxLength={100}
                multiline
                autoFocus
                selectTextOnFocus
                blurOnSubmit
                returnKeyType="done"
                onSubmitEditing={onConfirmEdit}
              />
              <Text
                style={[styles.recipeCount, { color: colors.textSecondary }]}
              >
                {t("manageBooks.recipeCount", { count: recipeCount })}
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.bookTitle, { color: textColor }]}>
                {source.name}
              </Text>
              <Text
                style={[styles.recipeCount, { color: colors.textSecondary }]}
              >
                {t("manageBooks.recipeCount", { count: recipeCount })}
              </Text>
            </>
          )}
        </Animated.View>
      </GestureDetector>

    </View>
  );
}

export default function ManageBooksScreen(): JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const colors = getColors(theme);
  const insets = useSafeAreaInsets();
  const isDark = theme === "dark";
  const textColor = isDark ? "#FFFFFF" : "#000000";
  const { sources, createSource, renameSource, deleteSource } = useSources();
  const { recipes, deleteRecipe } = useRecipes();
  const isDeletingRef = useRef(false);

  const [isAddingBook, setIsAddingBook] = useState(false);
  const [newBookName, setNewBookName] = useState("");
  const [editingSourceId, setEditingSourceId] = useState<SourceId | null>(null);
  const [editText, setEditText] = useState("");

  const recipeCounts = useMemo(() => {
    const counts = new Map<SourceId, number>();
    for (const recipe of recipes) {
      const src = recipe.metadata.source;
      if (src && !isUrl(src)) {
        counts.set(src, (counts.get(src) ?? 0) + 1);
      }
    }
    return counts;
  }, [recipes]);

  const handleStartAdd = useCallback(() => {
    setIsAddingBook(true);
    setNewBookName("");
  }, []);

  const handleCancelAdd = useCallback(() => {
    setIsAddingBook(false);
    setNewBookName("");
  }, []);

  const handleConfirmAdd = useCallback(async () => {
    const trimmed = newBookName.trim();
    if (!trimmed) return;
    try {
      await createSource(trimmed);
      setIsAddingBook(false);
      setNewBookName("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("already exists") && !message.includes("cannot be empty") && !message.includes("too long")) {
        console.warn("Unexpected error adding book:", error);
      }
    }
  }, [newBookName, createSource]);

  const handleDeleteBook = useCallback(
    (sourceId: SourceId) => {
      if (isDeletingRef.current) return;
      const source = sources.find((s) => s.id === sourceId);
      if (!source) return;
      const count = recipeCounts.get(sourceId) ?? 0;

      Alert.alert(
        t("manageBooks.deleteConfirmTitle", { name: source.name }),
        t("manageBooks.deleteConfirmMessage", { count }),
        [
          { text: t("manageBooks.deleteConfirmCancel"), style: "cancel" },
          {
            text: t("manageBooks.deleteConfirmAction"),
            style: "destructive",
            onPress: async () => {
              isDeletingRef.current = true;
              try {
                if (Platform.OS !== "web") {
                  Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Warning
                  );
                }
                const recipesToDelete = recipes.filter(
                  (r) => r.metadata.source === sourceId
                );
                for (const r of recipesToDelete) {
                  await deleteRecipe(r.id);
                }
                LayoutAnimation.configureNext(
                  LayoutAnimation.Presets.easeInEaseOut
                );
                await deleteSource(sourceId);
              } finally {
                isDeletingRef.current = false;
              }
            },
          },
        ]
      );
    },
    [sources, recipeCounts, recipes, deleteRecipe, deleteSource, t]
  );

  const handleStartEdit = useCallback(
    (sourceId: SourceId) => {
      const source = sources.find((s) => s.id === sourceId);
      if (!source) return;
      setEditingSourceId(sourceId);
      setEditText(source.name);
    },
    [sources]
  );

  const handleConfirmEdit = useCallback(async () => {
    if (!editingSourceId) return;
    const trimmed = editText.trim();
    if (trimmed) {
      try {
        await renameSource(editingSourceId, trimmed);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!message.includes("already exists") && !message.includes("cannot be empty") && !message.includes("too long")) {
          console.warn("Unexpected error renaming book:", error);
        }
      }
    }
    setEditingSourceId(null);
    setEditText("");
  }, [editingSourceId, editText, renameSource]);

  const handleCancelEdit = useCallback(() => {
    setEditingSourceId(null);
    setEditText("");
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={[styles.headerTitle, { color: textColor }]}>
          {t("manageBooks.title")}
        </Text>
      </View>

      {sources.length === 0 && !isAddingBook ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
            {t("manageBooks.emptyState")}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
        >
          {sources.map((source) => (
            <SwipeableBookRow
              key={source.id}
              source={source}
              recipeCount={recipeCounts.get(source.id) ?? 0}
              editingSourceId={editingSourceId}
              onDelete={handleDeleteBook}
              onStartEdit={handleStartEdit}
              onConfirmEdit={handleConfirmEdit}
              onCancelEdit={handleCancelEdit}
              editText={editText}
              onEditTextChange={setEditText}
            />
          ))}
        </ScrollView>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoid}
      >
        <View style={styles.bottomBar}>
          {isAddingBook ? (
            <>
              <LiquidGlassButton
                onPress={handleCancelAdd}
                systemImage="xmark"
                accessibilityLabel={t("manageBooks.deleteConfirmCancel")}
              />
              <View style={styles.addInput}>
                <LiquidGlassInput
                  value={newBookName}
                  onChangeText={setNewBookName}
                  placeholder={t("sourceSelector.addNewPlaceholder")}
                  variant="form"
                  style={styles.addInputField}
                  autoFocus
                  maxLength={100}
                  returnKeyType="done"
                  onSubmitEditing={handleConfirmAdd}
                />
              </View>
              <LiquidGlassButton
                onPress={handleConfirmAdd}
                systemImage="checkmark"
                accessibilityLabel={t("accessibility.confirm")}
              />
            </>
          ) : (
            <>
              <LiquidGlassButton
                onPress={router.back}
                systemImage="chevron.left"
                accessibilityLabel={t("manageBooks.back")}
              />
              <View style={styles.spacer} />
              <LiquidGlassButton
                onPress={handleStartAdd}
                systemImage="plus"
                accessibilityLabel={t("manageBooks.addBook")}
              />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 28,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: "bold",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 120,
  },
  rowContainer: {
    overflow: "hidden",
  },
  listItem: {
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  bookTitle: {
    fontSize: 17,
    fontWeight: "400",
  },
  recipeCount: {
    fontSize: 14,
    marginTop: 2,
  },
  editInput: {
    flex: 1,
    fontSize: 17,
    fontWeight: "400",
    padding: 0,
    margin: 0,
    marginRight: ACTION_BUTTON_WIDTH,
  },
  actionButtonContainer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    overflow: "hidden",
  },
  editButtonContainer: {
    left: 6,
  },
  deleteButtonContainer: {
    right: 6,
  },
  actionButtonPressable: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  actionButtonContent: {
    width: BUTTON_CONTENT_WIDTH,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonIcon: {
    minWidth: 36,
    height: 36,
    alignSelf: "stretch",
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 4,
  },
  actionButtonLabel: {
    fontSize: 13.5,
    fontWeight: "500",
    marginTop: 4,
  },
  editButtonColor: {
    backgroundColor: "#007AFF",
  },
  deleteButtonColor: {
    backgroundColor: "#FF3B30",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyStateText: {
    fontSize: 17,
  },
  keyboardAvoid: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 28,
    paddingBottom: 28,
  },
  addInput: {
    flex: 1,
  },
  addInputField: {
    height: 48,
  },
  spacer: {
    flex: 1,
  },
});

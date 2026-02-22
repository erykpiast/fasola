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
import { useCallback, useMemo, useRef, useState, type JSX } from "react";
import {
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SWIPE_THRESHOLD = 80;

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
  const isEditing = editingSourceId === source.id;

  const triggerDelete = useCallback(() => {
    onDelete(source.id);
  }, [source.id, onDelete]);

  const triggerEdit = useCallback(() => {
    onStartEdit(source.id);
  }, [source.id, onStartEdit]);

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      translateX.value = withSpring(0);
      if (event.translationX < -SWIPE_THRESHOLD) {
        runOnJS(triggerDelete)();
      } else if (event.translationX > SWIPE_THRESHOLD) {
        runOnJS(triggerEdit)();
      }
    });

  const cancelPan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onEnd((event) => {
      if (event.translationX > SWIPE_THRESHOLD) {
        runOnJS(onCancelEdit)();
      }
    });

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const deleteBackgroundStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < 0 ? Math.min(1, -translateX.value / SWIPE_THRESHOLD) : 0,
  }));

  const editBackgroundStyle = useAnimatedStyle(() => ({
    opacity: translateX.value > 0 ? Math.min(1, translateX.value / SWIPE_THRESHOLD) : 0,
  }));

  return (
    <GestureDetector gesture={isEditing ? cancelPan : pan}>
      <Animated.View>
        {/* Delete background (swipe left) */}
        <Animated.View
          style={[
            styles.actionBackground,
            styles.deleteBackground,
            deleteBackgroundStyle,
          ]}
        >
          <MaterialIcons name="delete" size={24} color="#FFFFFF" />
        </Animated.View>

        {/* Edit background (swipe right) */}
        <Animated.View
          style={[
            styles.actionBackground,
            styles.editBackground,
            editBackgroundStyle,
          ]}
        >
          <MaterialIcons
            name={isEditing ? "check" : "edit"}
            size={24}
            color="#FFFFFF"
          />
        </Animated.View>

        {/* Content */}
        <Animated.View style={[styles.listItem, contentStyle]}>
          {isEditing ? (
            <>
              <TextInput
                style={[styles.editInput, { color: textColor }]}
                value={editText}
                onChangeText={onEditTextChange}
                maxLength={100}
                autoFocus
                selectTextOnFocus
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

        <View
          style={[
            styles.separator,
            { backgroundColor: colors.separator },
          ]}
        />
      </Animated.View>
    </GestureDetector>
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
  listItem: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    backgroundColor: "transparent",
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
    fontSize: 17,
    fontWeight: "400",
    padding: 0,
    margin: 0,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 28,
  },
  actionBackground: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  deleteBackground: {
    backgroundColor: "#FF3B30",
    alignItems: "flex-end",
  },
  editBackground: {
    backgroundColor: "#007AFF",
    alignItems: "flex-start",
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

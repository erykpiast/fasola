import { GlassSelect } from "@/lib/components/atoms/GlassSelect";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { getGlassInputColors } from "@/platform/theme/glassStyles";
import { useTheme, type Theme } from "@/platform/theme/useTheme";
import { Picker } from "@react-native-picker/picker";
import { useCallback, useEffect, useState, type JSX } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSourceHistory } from "../hooks/useSourceHistory";

const ADD_NEW_VALUE = "__ADD_NEW__";

export function SourceSelector({
  value,
  onValueChange,
  onInteraction,
}: {
  value: string;
  onValueChange: (source: string, isAutomatic?: boolean) => void;
  onInteraction?: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const { sources, lastUsed, addSource } = useSourceHistory();

  const [addNewModalVisible, setAddNewModalVisible] = useState(false);
  const [pickerModalVisible, setPickerModalVisible] = useState(false);
  const [newSourceText, setNewSourceText] = useState("");
  const [tempValue, setTempValue] = useState(value);

  useEffect(() => {
    if (!value && lastUsed) {
      onValueChange(lastUsed, true);
    }
  }, [lastUsed, value, onValueChange]);

  // Sync tempValue when value changes externally
  useEffect(() => {
    setTempValue(value);
  }, [value]);

  const openPickerModal = useCallback(() => {
    setTempValue(value || (sources.length > 0 ? sources[0].source : ""));
    setPickerModalVisible(true);
    onInteraction?.();
  }, [value, sources, onInteraction]);

  const handlePickerDone = useCallback(() => {
    setPickerModalVisible(false);
    if (tempValue === ADD_NEW_VALUE) {
      setAddNewModalVisible(true);
    } else if (tempValue) {
      onValueChange(tempValue, false);
    }
  }, [tempValue, onValueChange]);

  const handlePickerCancel = useCallback(() => {
    setPickerModalVisible(false);
    setTempValue(value);
  }, [value]);

  const handleAddNewSource = useCallback(async () => {
    const trimmedSource = newSourceText.trim();
    if (!trimmedSource) {
      return;
    }

    await addSource(trimmedSource);
    onValueChange(trimmedSource, false);
    setAddNewModalVisible(false);
    setNewSourceText("");
  }, [newSourceText, addSource, onValueChange]);

  const handleCancelAddNew = useCallback(() => {
    setAddNewModalVisible(false);
    setNewSourceText("");
  }, []);

  const handleWebPickerChange = useCallback(
    (itemValue: string) => {
      if (itemValue === ADD_NEW_VALUE) {
        setAddNewModalVisible(true);
        onInteraction?.();
      } else if (itemValue) {
        onValueChange(itemValue, false);
        onInteraction?.();
      }
    },
    [onValueChange, onInteraction]
  );

  const isWeb = Platform.OS === "web";
  const themeColors = getThemeColors(theme);

  return (
    <>
      <View style={styles.container}>
        {isWeb ? (
          <Picker
            selectedValue={value || ""}
            onValueChange={handleWebPickerChange}
            style={[styles.triggerButton, themeColors.triggerButton]}
          >
            {!value && (
              <Picker.Item
                label={t("sourceSelector.placeholder")}
                value=""
                enabled={false}
              />
            )}
            {sources.map((entry) => (
              <Picker.Item
                key={entry.source}
                label={entry.source}
                value={entry.source}
              />
            ))}
            <Picker.Item
              label={t("sourceSelector.addNew")}
              value={ADD_NEW_VALUE}
            />
          </Picker>
        ) : (
          <GlassSelect
            value={value}
            placeholder={t("sourceSelector.placeholder")}
            onPress={openPickerModal}
            style={styles.glassSelect}
          />
        )}
      </View>

      {/* Picker Modal - shows full-height native iOS picker wheel */}
      <Modal
        visible={pickerModalVisible}
        transparent
        animationType="slide"
        onRequestClose={handlePickerCancel}
      >
        <View style={styles.pickerModalOverlay}>
          <Pressable
            style={styles.pickerModalBackdrop}
            onPress={handlePickerCancel}
          />
          <View
            style={[
              styles.pickerModalContent,
              {
                backgroundColor:
                  theme === "dark"
                    ? "rgba(44, 44, 46, 1)"
                    : "rgba(255, 255, 255, 1)",
              },
            ]}
          >
            <View style={styles.pickerToolbar}>
              <Pressable onPress={handlePickerCancel}>
                <Text style={styles.pickerToolbarButton}>
                  {t("recipeForm.discardChanges.cancel")}
                </Text>
              </Pressable>
              <Pressable onPress={handlePickerDone}>
                <Text
                  style={[
                    styles.pickerToolbarButton,
                    styles.pickerToolbarButtonDone,
                  ]}
                >
                  {t("recipeForm.submit")}
                </Text>
              </Pressable>
            </View>
            <Picker
              selectedValue={tempValue}
              onValueChange={setTempValue}
              style={styles.pickerWheel}
              itemStyle={themeColors.pickerItem}
            >
              {sources.map((entry) => (
                <Picker.Item
                  key={entry.source}
                  label={entry.source}
                  value={entry.source}
                />
              ))}
              <Picker.Item
                label={t("sourceSelector.addNew")}
                value={ADD_NEW_VALUE}
              />
            </Picker>
          </View>
        </View>
      </Modal>

      {/* Add New Source Modal */}
      <Modal
        visible={addNewModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancelAddNew}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={handleCancelAddNew}
          accessible={false}
        >
          <Pressable
            style={styles.modalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor:
                    theme === "dark"
                      ? "rgba(28, 28, 30, 0.95)"
                      : "rgba(255, 255, 255, 0.95)",
                },
              ]}
            >
              <Text style={[styles.modalTitle, themeColors.label]}>
                {t("sourceSelector.addNewTitle")}
              </Text>

              <TextInput
                value={newSourceText}
                onChangeText={setNewSourceText}
                placeholder={t("sourceSelector.addNewPlaceholder")}
                placeholderTextColor={themeColors.placeholder.color}
                style={[styles.modalInput, themeColors.input]}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleAddNewSource}
              />

              <View style={styles.modalButtons}>
                <Pressable
                  onPress={handleCancelAddNew}
                  style={({ pressed }) => [
                    styles.modalButton,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Text style={[styles.modalButtonText, themeColors.label]}>
                    {t("recipeForm.discardChanges.cancel")}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handleAddNewSource}
                  style={({ pressed }) => [
                    styles.modalButton,
                    styles.modalButtonPrimary,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Text
                    style={[
                      styles.modalButtonText,
                      styles.modalButtonTextPrimary,
                    ]}
                  >
                    {t("recipeForm.submit")}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function getThemeColors(theme: Theme) {
  const isDark = theme === "dark";
  const inputColors = getGlassInputColors(theme);

  return {
    label: inputColors.label,
    text: inputColors.text,
    input: {
      backgroundColor: "transparent",
      borderColor: isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)",
      color: isDark ? "rgba(255, 255, 255, 0.5)" : "#000000",
    },
    triggerButton: {
      backgroundColor: isDark
        ? "rgba(255, 255, 255, 0.1)"
        : "rgba(0, 0, 0, 0.05)",
      borderColor: isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)",
    },
    pickerItem: {
      color: isDark ? "#FFFFFF" : "#000000",
      fontSize: 20,
    },
    placeholder: inputColors.placeholder,
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  glassSelect: {
    flex: 1,
  },
  triggerButton: {
    height: 48,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  pickerModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  pickerModalContent: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: "hidden",
  },
  pickerToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128, 128, 128, 0.3)",
  },
  pickerToolbarButton: {
    fontSize: 17,
    color: "#007AFF",
  },
  pickerToolbarButtonDone: {
    fontWeight: "600",
  },
  pickerWheel: {
    height: 216,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "80%",
    maxWidth: 400,
  },
  modalCard: {
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 16,
  },
  modalInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: 28,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  modalButtonPrimary: {
    backgroundColor: "#007AFF",
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
  modalButtonTextPrimary: {
    color: "#FFFFFF",
  },
});

import { useSources } from "@/features/sources/context/SourcesContext";
import type { SourceId } from "@/lib/types/primitives";
import { LiquidGlassInput, LiquidGlassSelect } from "@/modules/liquid-glass";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { getGlassInputColors } from "@/platform/theme/glassStyles";
import { useTheme, type Theme } from "@/platform/theme/useTheme";
import { Picker } from "@react-native-picker/picker";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
  type JSX,
} from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

const ADD_NEW_VALUE = "__ADD_NEW__";

export interface SourceSelectorRef {
  confirmNewSource: () => Promise<SourceId | undefined>;
  cancelEdit: () => boolean;
}

export const SourceSelector = forwardRef<
  SourceSelectorRef,
  {
    value: SourceId;
    onValueChange: (sourceId: SourceId, isAutomatic?: boolean) => void;
    onInteraction?: () => void;
    onEditingChange?: (editing: boolean) => void;
    onHasNoSourcesChange?: (hasNoSources: boolean) => void;
  }
>(function SourceSelector(
  { value, onValueChange, onInteraction, onEditingChange, onHasNoSourcesChange },
  ref
): JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const { sources, createSource, getLastUsed } = useSources();

  const [isEditingNewSource, setIsEditingNewSource] = useState(false);
  const [pickerModalVisible, setPickerModalVisible] = useState(false);
  const [newSourceText, setNewSourceText] = useState("");
  const [tempValue, setTempValue] = useState(value);

  const hasNoSources = sources.length === 0;

  useEffect(() => {
    onHasNoSourcesChange?.(hasNoSources);
  }, [hasNoSources, onHasNoSourcesChange]);

  useEffect(() => {
    if (!value) {
      const lastUsed = getLastUsed();
      if (lastUsed) {
        onValueChange(lastUsed.id, true);
      }
    }
  }, [getLastUsed, value, onValueChange]);

  // Sync tempValue when value changes externally
  useEffect(() => {
    setTempValue(value);
  }, [value]);

  const selectedSourceName = sources.find((s) => s.id === value)?.name ?? "";

  const openPickerModal = useCallback(() => {
    setTempValue(value || (sources.length > 0 ? sources[0].id : ""));
    setPickerModalVisible(true);
    onInteraction?.();
  }, [value, sources, onInteraction]);

  const handleNativePickerChange = useCallback(
    (itemValue: string) => {
      setTempValue(itemValue);
      setPickerModalVisible(false);
      if (itemValue === ADD_NEW_VALUE) {
        setIsEditingNewSource(true);
      } else if (itemValue) {
        onValueChange(itemValue, false);
      }
    },
    [onValueChange]
  );

  const handlePickerClose = useCallback(() => {
    setPickerModalVisible(false);
    setTempValue(value);
  }, [value]);

  const handleConfirmNewSource = useCallback(async (): Promise<
    SourceId | undefined
  > => {
    const trimmedSource = newSourceText.trim();
    if (!trimmedSource) {
      return undefined;
    }

    const newSource = await createSource(trimmedSource);
    onValueChange(newSource.id, false);
    setIsEditingNewSource(false);
    setNewSourceText("");
    return newSource.id;
  }, [newSourceText, createSource, onValueChange]);

  const handleCancelEdit = useCallback<() => boolean>((): boolean => {
    const wasEditing = isEditingNewSource;
    if (wasEditing) {
      setIsEditingNewSource(false);
    }
    setNewSourceText("");
    return wasEditing;
  }, [isEditingNewSource]);

  useEffect(() => {
    onEditingChange?.(isEditingNewSource || hasNoSources);
  }, [isEditingNewSource, hasNoSources, onEditingChange]);

  useImperativeHandle(
    ref,
    () => ({
      confirmNewSource: handleConfirmNewSource,
      cancelEdit: handleCancelEdit,
    }),
    [handleConfirmNewSource, handleCancelEdit]
  );

  const handleWebPickerChange = useCallback(
    (itemValue: string) => {
      if (itemValue === ADD_NEW_VALUE) {
        setIsEditingNewSource(true);
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
            {sources.map((source) => (
              <Picker.Item
                key={source.id}
                label={source.name}
                value={source.id}
              />
            ))}
            <Picker.Item
              label={t("sourceSelector.addNew")}
              value={ADD_NEW_VALUE}
            />
          </Picker>
        ) : hasNoSources || isEditingNewSource ? (
          <LiquidGlassInput
            value={newSourceText}
            onChangeText={setNewSourceText}
            placeholder={t("sourceSelector.addNewPlaceholder")}
            variant="text"
            autoFocus
            maxLength={100}
            returnKeyType="done"
            onSubmitEditing={handleConfirmNewSource}
            style={styles.glassSelect}
          />
        ) : (
          <LiquidGlassSelect
            value={selectedSourceName}
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
        onRequestClose={handlePickerClose}
      >
        <View style={styles.pickerModalOverlay}>
          <Pressable
            style={styles.pickerModalBackdrop}
            onPress={handlePickerClose}
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
            <Picker
              selectedValue={tempValue}
              onValueChange={handleNativePickerChange}
              style={styles.pickerWheel}
              itemStyle={themeColors.pickerItem}
            >
              {sources.map((source) => (
                <Picker.Item
                  key={source.id}
                  label={source.name}
                  value={source.id}
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
    </>
  );
});

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
    flexGrow: 1,
    flexShrink: 0,
  },
  glassSelect: {
    height: 48,
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
  pickerWheel: {
    height: 216,
  },
});

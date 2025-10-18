import * as Haptics from "expo-haptics";
import { useCallback, useMemo } from "react";
import { ActionSheetIOS, Alert, Platform } from "react-native";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { usePhotoImport } from "./usePhotoImport";

export function usePhotoAdd(): {
  importPhoto: (onPhotoSelected: (uri: string) => void) => Promise<void>;
  isImporting: boolean;
} {
  const { importFromCamera, importFromLibrary, isImporting } = usePhotoImport();
  const { t } = useTranslation();

  const importPhoto = useCallback(async (onPhotoSelected: (uri: string) => void) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const handleCamera = async () => {
      const uri = await importFromCamera();
      if (uri) {
        onPhotoSelected(uri);
      }
    };

    const handleLibrary = async () => {
      const uri = await importFromLibrary();
      if (uri) {
        onPhotoSelected(uri);
      }
    };

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t("addPhoto.camera"), t("addPhoto.library"), "Cancel"],
          cancelButtonIndex: 2,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            handleCamera();
          } else if (buttonIndex === 1) {
            handleLibrary();
          }
        }
      );
    } else {
      Alert.alert(t("addPhoto.button"), "", [
        { text: t("addPhoto.camera"), onPress: handleCamera },
        { text: t("addPhoto.library"), onPress: handleLibrary },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  }, [importFromCamera, importFromLibrary, t]);

  return useMemo(
    () => ({
      importPhoto,
      isImporting,
    }),
    [importPhoto, isImporting]
  );
}

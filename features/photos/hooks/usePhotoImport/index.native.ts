import { usePhotoAdjustment } from "@/features/photo-adjustment/hooks/usePhotoAdjustment";
import { Alert } from "@/lib/alert";
import type { PhotoUri } from "@/lib/types/primitives";
import { useTranslation } from "@/platform/i18n/useTranslation";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActionSheetIOS, Platform } from "react-native";

export function usePhotoImport(): {
  startImport: () => Promise<void>;
  isImporting: boolean;
} {
  const [isImporting, setIsImporting] = useState(false);
  const { t } = useTranslation();
  const { processPhoto } = usePhotoAdjustment();

  const importFromCamera = useCallback(async (): Promise<PhotoUri | null> => {
    setIsImporting(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        return null;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets[0]) {
        return result.assets[0].uri;
      }
      return null;
    } finally {
      setIsImporting(false);
    }
  }, []);

  const importFromLibrary = useCallback(async (): Promise<PhotoUri | null> => {
    setIsImporting(true);
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: false,
        allowsMultipleSelection: false,
      });

      if (!result.canceled && result.assets[0]) {
        return result.assets[0].uri;
      }
      return null;
    } finally {
      setIsImporting(false);
    }
  }, []);

  const startImport = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const handleCamera = async () => {
      const uri = await importFromCamera();
      if (uri) {
        const result = await processPhoto(uri);
        router.push({
          pathname: "/recipe/add",
          params: { uri: result.processedUri || uri },
        });
      }
    };

    const handleLibrary = async () => {
      const uri = await importFromLibrary();
      if (uri) {
        const result = await processPhoto(uri);
        router.push({
          pathname: "/recipe/add",
          params: { uri: result.processedUri || uri },
        });
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
  }, [importFromCamera, importFromLibrary, processPhoto, t]);

  return useMemo(
    () => ({
      startImport,
      isImporting,
    }),
    [startImport, isImporting]
  );
}

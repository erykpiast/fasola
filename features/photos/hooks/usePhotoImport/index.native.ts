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
    } catch (error) {
      console.error("Camera import error:", error);
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
    } catch (error) {
      console.error("Library import error:", error);
      return null;
    } finally {
      setIsImporting(false);
    }
  }, []);

  const handlePhotoImport = useCallback(
    async (uri: PhotoUri): Promise<void> => {
      setIsImporting(true);
      try {
        // Automatically process photo through adjustment pipeline
        const result = await processPhoto(uri);

        // Navigate to recipe creation with processed photo
        // Falls back to original photo if processing fails
        const finalUri = result.processedUri || uri;
        router.push({
          pathname: "/recipe/add",
          params: { uri: finalUri },
        });
      } catch (error) {
        console.error("Photo processing error:", error);
        // Fall back to original photo on error
        router.push({
          pathname: "/recipe/add",
          params: { uri },
        });
      } finally {
        setIsImporting(false);
      }
    },
    [processPhoto]
  );

  const startImport = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const handleCamera = async (): Promise<void> => {
      const uri = await importFromCamera();
      if (uri) {
        await handlePhotoImport(uri);
      }
    };

    const handleLibrary = async (): Promise<void> => {
      const uri = await importFromLibrary();
      if (uri) {
        await handlePhotoImport(uri);
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
  }, [importFromCamera, importFromLibrary, handlePhotoImport, t]);

  return useMemo(
    () => ({
      startImport,
      isImporting,
    }),
    [startImport, isImporting]
  );
}

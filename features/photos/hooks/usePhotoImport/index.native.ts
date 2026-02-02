import type { PhotoUri } from "@/lib/types/primitives";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";

export type ImportOption = "camera" | "library";

export function usePhotoImport(): {
  handleOptionSelect: (option: ImportOption) => Promise<void>;
  showPopover: () => void;
  isImporting: boolean;
  popoverVisible: boolean;
  dismissPopover: () => void;
} {
  const [isImporting, setIsImporting] = useState(false);
  const [popoverVisible, setPopoverVisible] = useState(false);

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
        router.push({
          pathname: "/recipe/add",
          params: { uri },
        });
      } catch (error) {
        console.error("Photo import error:", error);
      } finally {
        setIsImporting(false);
      }
    },
    [],
  );

  const showPopover = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPopoverVisible(true);
  }, []);

  const dismissPopover = useCallback(() => {
    setPopoverVisible(false);
  }, []);

  const handleOptionSelect = useCallback(
    async (option: ImportOption): Promise<void> => {
      setPopoverVisible(false);

      if (option === "camera") {
        const uri = await importFromCamera();
        if (uri) {
          await handlePhotoImport(uri);
        }
      } else if (option === "library") {
        const uri = await importFromLibrary();
        if (uri) {
          await handlePhotoImport(uri);
        }
      }
    },
    [importFromCamera, importFromLibrary, handlePhotoImport],
  );

  return useMemo(
    () => ({
      handleOptionSelect,
      showPopover,
      isImporting,
      popoverVisible,
      dismissPopover,
    }),
    [
      handleOptionSelect,
      showPopover,
      isImporting,
      popoverVisible,
      dismissPopover,
    ],
  );
}

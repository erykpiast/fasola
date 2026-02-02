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

  const importFromLibrary = useCallback(async () => {
    setIsImporting(true);
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: false,
        allowsMultipleSelection: false,
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        router.push({
          pathname: "/recipe/add",
          params: { uri },
        });
      }
    } catch (error) {
      console.error("Photo import error:", error);
    } finally {
      setIsImporting(false);
    }
  }, []);

  const handleOptionSelect = useCallback(
    async (option: ImportOption): Promise<void> => {
      if (option === "library") {
        await importFromLibrary();
      }
    },
    [importFromLibrary],
  );

  const showPopover = useCallback(() => {
    importFromLibrary();
  }, [importFromLibrary]);

  const dismissPopover = useCallback(() => {
    // No-op on web since there's no popover
  }, []);

  return useMemo(
    () => ({
      handleOptionSelect,
      showPopover,
      isImporting,
      popoverVisible: false,
      dismissPopover,
    }),
    [handleOptionSelect, showPopover, isImporting, dismissPopover],
  );
}

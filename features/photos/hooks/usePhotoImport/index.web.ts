import { usePhotoAdjustment } from "@/features/photo-adjustment/hooks/usePhotoAdjustment";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";

export function usePhotoImport(): {
  startImport: () => Promise<void>;
  isImporting: boolean;
} {
  const [isImporting, setIsImporting] = useState(false);
  const { processPhoto } = usePhotoAdjustment();

  const startImport = useCallback(async () => {
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
        const processResult = await processPhoto(uri);
        router.push({
          pathname: "/recipe/add",
          params: { uri: processResult.processedUri || uri },
        });
      }
    } finally {
      setIsImporting(false);
    }
  }, [processPhoto]);

  return useMemo(
    () => ({
      startImport,
      isImporting,
    }),
    [startImport, isImporting]
  );
}

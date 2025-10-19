import { useCallback, useMemo, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import type { PhotoUri } from "@/lib/types/primitives";

export function usePhotoImport(): {
  startImport: () => Promise<void>;
  isImporting: boolean;
} {
  const [isImporting, setIsImporting] = useState(false);

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
        router.push({
          pathname: "/recipe/add",
          params: { uri },
        });
      }
    } finally {
      setIsImporting(false);
    }
  }, []);

  return useMemo(
    () => ({
      startImport,
      isImporting,
    }),
    [startImport, isImporting],
  );
}

import * as ImagePicker from 'expo-image-picker';
import { useCallback, useMemo, useState } from 'react';

export function usePhotoImport(): {
  isImporting: boolean;
  importFromCamera: () => Promise<string | null>;
  importFromLibrary: () => Promise<string | null>;
} {
  const [isImporting, setIsImporting] = useState(false);

  const importFromCamera = useCallback(async (): Promise<string | null> => {
    setIsImporting(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        return null;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
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

  const importFromLibrary = useCallback(async (): Promise<string | null> => {
    setIsImporting(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
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

  return useMemo(
    () => ({
      isImporting,
      importFromCamera,
      importFromLibrary,
    }),
    [isImporting, importFromCamera, importFromLibrary]
  );
}

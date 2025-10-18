import { useCallback, useMemo, useRef, useState } from "react";

export function usePhotoAdd(): {
  importPhoto: (onPhotoSelected: (uri: string) => void) => void;
  isImporting: boolean;
} {
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const importPhoto = useCallback((onPhotoSelected: (uri: string) => void): void => {
    if (!fileInputRef.current) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.style.display = "none";

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          setIsImporting(true);
          try {
            const reader = new FileReader();
            reader.onload = (event) => {
              const uri = event.target?.result as string;
              if (uri) {
                onPhotoSelected(uri);
              }
              setIsImporting(false);
            };
            reader.onerror = () => {
              setIsImporting(false);
            };
            reader.readAsDataURL(file);
          } catch (error) {
            setIsImporting(false);
          }
        }
      };

      document.body.appendChild(input);
      fileInputRef.current = input;
    }

    fileInputRef.current.click();
  }, []);

  return useMemo(
    () => ({
      importPhoto,
      isImporting,
    }),
    [importPhoto, isImporting]
  );
}

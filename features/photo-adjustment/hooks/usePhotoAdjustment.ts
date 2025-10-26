import { loadOpenCV } from "@/lib/photo-processor/opencv-loader";
import type { ProcessingResult } from "@/lib/photo-processor/types";
import type { DataUrl, PhotoUri } from "@/lib/types/primitives";
import { useCallback, useMemo, useState } from "react";

/**
 * Hook for automatic photo adjustment processing.
 * Provides processing function with error handling and fallback to original.
 */
export function usePhotoAdjustment(): {
  processPhoto: (photoUri: PhotoUri) => Promise<ProcessingResult>;
  isProcessing: boolean;
} {
  const [isProcessing, setIsProcessing] = useState(false);

  const processPhoto = useCallback(
    async (photoUri: PhotoUri): Promise<ProcessingResult> => {
      setIsProcessing(true);

      try {
        const opencv = await loadOpenCV();

        // Phase 0: Process with passthrough operation (no actual processing)
        // Processing pipelines will be added in Phase 1-3
        const processedUri = await opencv.processImage(photoUri, [
          { type: "passthrough" },
        ]);

        setIsProcessing(false);
        return {
          success: true,
          processedUri,
        };
      } catch (error) {
        setIsProcessing(false);

        // On any error, return the original photo
        return {
          success: false,
          processedUri: photoUri as DataUrl,
          error: {
            code: "PROCESSING_FAILED",
            message:
              error instanceof Error ? error.message : "Unknown error occurred",
          },
        };
      }
    },
    []
  );

  return useMemo(
    () => ({
      processPhoto,
      isProcessing,
    }),
    [processPhoto, isProcessing]
  );
}

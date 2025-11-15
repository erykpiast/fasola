import { useDebugContext } from "@/features/photo-adjustment/context/DebugContext";
import { loadOpenCV } from "@/lib/photo-processor/opencv-loader";
import {
  DEFAULT_ADJUSTMENT_CONFIG,
  type ProcessingResult,
} from "@/lib/photo-processor/types";
import type { DataUrl, PhotoUri } from "@/lib/types/primitives";
import { useCallback, useMemo, useState } from "react";
import { Platform } from "react-native";

/**
 * Hook for automatic photo adjustment processing.
 * Provides processing function with error handling and fallback to original.
 */
export function usePhotoAdjustment(): {
  processPhoto: (photoUri: PhotoUri) => Promise<ProcessingResult>;
  isProcessing: boolean;
} {
  const [isProcessing, setIsProcessing] = useState(false);
  const { setDebugData } = useDebugContext();

  const processPhoto = useCallback(
    async (photoUri: PhotoUri): Promise<ProcessingResult> => {
      setIsProcessing(true);

      if (Platform.OS === "web") {
        await new Promise((resolve) => setTimeout(resolve, 60_000));
      }

      try {
        const opencv = await loadOpenCV();

        const { dataUrl: processedUri, debug } = await opencv.processImage(
          photoUri,
          [
            {
              type: "geometry",
              config: DEFAULT_ADJUSTMENT_CONFIG.geometry,
              debug: DEFAULT_ADJUSTMENT_CONFIG.debug?.enabled,
            },
          ]
        );

        if (debug) {
          setDebugData(debug);
        }

        setIsProcessing(false);
        return {
          success: true,
          processedUri,
          debug,
        };
      } catch (error) {
        setIsProcessing(false);

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
    [setDebugData]
  );

  return useMemo(
    () => ({
      processPhoto,
      isProcessing,
    }),
    [processPhoto, isProcessing]
  );
}

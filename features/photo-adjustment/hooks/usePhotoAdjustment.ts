import {
  handleOpenCVMessage,
  OpenCVBridgeSetup,
  processPhoto,
  setOpenCVReady,
  type PhotoAdjustmentConfig,
  type ProcessingResult,
  DEFAULT_CONFIG,
} from "@/lib/photo-processor";
import type { DataUrl, PhotoUri } from "@/lib/types/primitives";
import { useCallback, useMemo, useState, type JSX } from "react";

interface UsePhotoAdjustmentReturn {
  processPhoto: (photoUri: PhotoUri) => Promise<ProcessingResult>;
  isProcessing: boolean;
  WebViewSetup: () => JSX.Element | null;
}

/**
 * Platform-agnostic photo adjustment hook
 * Automatically processes photos through the adjustment pipeline
 */
export function usePhotoAdjustment({
  geometry = DEFAULT_CONFIG.geometry,
  lighting = DEFAULT_CONFIG.lighting,
  clarity = DEFAULT_CONFIG.clarity,
}: Partial<PhotoAdjustmentConfig> = DEFAULT_CONFIG): UsePhotoAdjustmentReturn {
  const [isProcessing, setIsProcessing] = useState(false);

  const finalConfig = useMemo(
    (): PhotoAdjustmentConfig => ({
      geometry: { ...DEFAULT_CONFIG.geometry, ...geometry },
      lighting: { ...DEFAULT_CONFIG.lighting, ...lighting },
      clarity: { ...DEFAULT_CONFIG.clarity, ...clarity },
    }),
    [geometry, lighting, clarity]
  );

  const processPhotoCallback = useCallback(
    async (photoUri: PhotoUri): Promise<ProcessingResult> => {
      setIsProcessing(true);

      try {
        const result = await processPhoto(photoUri, finalConfig);
        return result;
      } catch (error) {
        console.error("[Photo Adjustment] Photo processing error:", error);
        return {
          success: false,
          processedUri: photoUri as DataUrl,
          error: {
            code: "PROCESSING_FAILED",
            message: error instanceof Error ? error.message : "Unknown error",
          },
        };
      } finally {
        setIsProcessing(false);
      }
    },
    [finalConfig]
  );

  // Platform-specific WebView setup component
  const WebViewSetup = useCallback((): JSX.Element | null => {
    return OpenCVBridgeSetup({
      onReady: setOpenCVReady,
      onMessage: handleOpenCVMessage,
    });
  }, []);

  return useMemo(
    () => ({
      processPhoto: processPhotoCallback,
      isProcessing,
      WebViewSetup,
    }),
    [processPhotoCallback, isProcessing, WebViewSetup]
  );
}

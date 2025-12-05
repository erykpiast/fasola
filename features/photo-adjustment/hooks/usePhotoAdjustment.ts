import {
  dewarpImage,
  handleDewarpMessage,
  setDewarpReady,
} from "@/lib/photo-processor/dewarp-loader";
import { DewarpWebViewSetup } from "@/lib/photo-processor/DewarpWebViewSetup";
import type {
  PhotoAdjustmentConfig,
  ProcessingResult,
} from "@/lib/photo-processor/types";
import { DEFAULT_CONFIG } from "@/lib/photo-processor/types";
import { loadImageAsDataUrl } from "@/lib/photo-processor/utils/loadImageAsDataUrl";
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

  const processPhoto = useCallback(
    async (photoUri: PhotoUri): Promise<ProcessingResult> => {
      setIsProcessing(true);

      try {
        // Phase 1: Geometry correction using page-dewarp-js
        // Future phases will add lighting and clarity pipelines

        if (!finalConfig.geometry.enabled) {
          // Skip processing if geometry correction is disabled
          return {
            success: true,
            processedUri: photoUri as DataUrl,
          };
        }

        // Convert photo URI to data URL if needed
        let imageDataUrl: DataUrl;
        if (photoUri.startsWith("data:")) {
          imageDataUrl = photoUri as DataUrl;
        } else {
          // For file:// URIs, we need to load and convert to data URL
          imageDataUrl = await loadImageAsDataUrl(photoUri);
        }

        // Run geometry correction (page-dewarp-js)
        console.log("[Phase 1] Processing photo with geometry correction");
        const result = await dewarpImage(imageDataUrl, finalConfig.geometry);

        if (!result.success) {
          console.warn(
            "[Phase 1] Geometry correction failed, using original:",
            result.error
          );
          // Fallback to original on error
          return {
            success: false,
            processedUri: photoUri as DataUrl,
            error: {
              code: "DEWARP_FAILED",
              message: result.error || "Dewarping failed",
            },
          };
        }

        console.log("[Phase 1] Photo processing complete");
        return {
          success: true,
          processedUri: result.processedUri,
        };
      } catch (error) {
        console.error("[Phase 1] Photo processing error:", error);
        // Fallback to original photo
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
    return DewarpWebViewSetup({
      onReady: setDewarpReady,
      onMessage: handleDewarpMessage,
    });
  }, []);

  return useMemo(
    () => ({
      processPhoto,
      isProcessing,
      WebViewSetup,
    }),
    [processPhoto, isProcessing, WebViewSetup]
  );
}

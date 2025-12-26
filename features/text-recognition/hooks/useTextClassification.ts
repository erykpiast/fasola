/**
 * useTextClassification Hook
 * Triggers text classification and updates context with results
 * Platform-agnostic wrapper around text classifier
 */

import { classifyText } from "@/lib/text-classifier";
import { useCallback, useEffect } from "react";
import { useTextRecognition } from "../context/TextRecognitionContext";

/**
 * Hook to automatically classify OCR text
 * Runs classification in background when OCR text is available
 */
export function useTextClassification(): {
  classify: (text: string) => Promise<void>;
  isClassifying: boolean;
} {
  const {
    ocrText,
    setClassificationResult,
    setIsClassifying,
    setClassificationError,
    isClassifying,
  } = useTextRecognition();

  const classify = useCallback(
    async (text: string): Promise<void> => {
      if (!text || text.trim().length === 0) {
        return;
      }

      try {
        setIsClassifying(true);
        setClassificationError(undefined);

        console.log("[Text Classification] Starting classification...");
        const result = await classifyText(text);

        console.log(
          `[Text Classification] Completed in ${result.processingTimeMs}ms`,
          result
        );

        setClassificationResult(result);
      } catch (error) {
        console.error("[Text Classification] Classification failed:", error);
        setClassificationError(
          error instanceof Error ? error.message : "Classification failed"
        );
      } finally {
        setIsClassifying(false);
      }
    },
    [setClassificationResult, setIsClassifying, setClassificationError]
  );

  // Auto-classify when OCR text becomes available
  useEffect(() => {
    if (ocrText && ocrText.trim().length > 0) {
      classify(ocrText);
    }
  }, [ocrText, classify]);

  return { classify, isClassifying };
}




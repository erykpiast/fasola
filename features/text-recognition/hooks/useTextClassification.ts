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

        const startTime = Date.now();
        console.log("[Text Classification] Starting classification...");
        let result = await classifyText(text, "embeddings");

        if (result.suggestions.length === 0) {
          console.log(
            "[Text Classification] No suggestions found with embeddings, using TF-IDF..."
          );
          result = await classifyText(text, "tfidf");
        }

        console.log(
          `[Text Classification] Completed in ${Date.now() - startTime}ms`,
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

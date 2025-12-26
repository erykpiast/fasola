/**
 * Text Recognition Context
 * Stores extracted OCR text and classification results
 * Manages async processing state for text classification
 */

import type { ClassificationResult } from "@/lib/text-classifier/index.d";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type JSX,
} from "react";

interface TextRecognitionContextValue {
  ocrText: string | undefined;
  classificationResult: ClassificationResult | undefined;
  isClassifying: boolean;
  classificationError: string | undefined;
  setOcrText: (text: string | undefined) => void;
  setClassificationResult: (result: ClassificationResult | undefined) => void;
  setIsClassifying: (isClassifying: boolean) => void;
  setClassificationError: (error: string | undefined) => void;
  reset: () => void;
}

const TextRecognitionContext = createContext<
  TextRecognitionContextValue | undefined
>(undefined);

/**
 * Provider for text recognition state
 */
export function TextRecognitionProvider({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  const [ocrText, setOcrText] = useState<string | undefined>();
  const [classificationResult, setClassificationResult] = useState<
    ClassificationResult | undefined
  >();
  const [isClassifying, setIsClassifying] = useState(false);
  const [classificationError, setClassificationError] = useState<
    string | undefined
  >();

  const reset = useCallback(() => {
    setOcrText(undefined);
    setClassificationResult(undefined);
    setIsClassifying(false);
    setClassificationError(undefined);
  }, []);

  const value = useMemo(
    (): TextRecognitionContextValue => ({
      ocrText,
      classificationResult,
      isClassifying,
      classificationError,
      setOcrText,
      setClassificationResult,
      setIsClassifying,
      setClassificationError,
      reset,
    }),
    [
      ocrText,
      classificationResult,
      isClassifying,
      classificationError,
      reset,
    ]
  );

  return (
    <TextRecognitionContext.Provider value={value}>
      {children}
    </TextRecognitionContext.Provider>
  );
}

/**
 * Hook to access text recognition context
 */
export function useTextRecognition(): TextRecognitionContextValue {
  const context = useContext(TextRecognitionContext);
  if (!context) {
    throw new Error(
      "useTextRecognition must be used within TextRecognitionProvider"
    );
  }
  return context;
}




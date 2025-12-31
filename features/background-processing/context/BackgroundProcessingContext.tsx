/**
 * Background Processing Context
 * Manages a queue of pending recipe processing tasks
 * Persists state across navigation and app restarts
 */

import { useRecipes } from "@/features/recipes-list/context/RecipesContext";
import { processPhoto } from "@/lib/photo-processor";
import { DEFAULT_CONFIG } from "@/lib/photo-processor/types";
import { loadImageAsDataUrl } from "@/lib/photo-processor/utils/loadImageAsDataUrl";
import { recipeRepository } from "@/lib/repositories/recipes";
import { storage } from "@/lib/storage";
import { classifyText } from "@/lib/text-classifier";
import type { RecipeId } from "@/lib/types/primitives";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";

interface ProcessingProgress {
  recipeId: RecipeId;
  phase: "geometry" | "lighting" | "clarity" | "ocr" | "classification";
  progress: number;
}

interface BackgroundProcessingContextValue {
  addToQueue: (recipeId: RecipeId) => void;
  isProcessing: (recipeId: RecipeId) => boolean;
  processingProgress: (recipeId: RecipeId) => ProcessingProgress | null;
  currentlyProcessing: RecipeId | null;
}

const BackgroundProcessingContext =
  createContext<BackgroundProcessingContextValue | null>(null);

export function BackgroundProcessingProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const { updateProcessing, updateComplete } = useRecipes();
  const [queue, setQueue] = useState<Array<RecipeId>>([]);
  const [currentlyProcessing, setCurrentlyProcessing] =
    useState<RecipeId | null>(null);
  const [progress, setProgress] = useState<Map<RecipeId, ProcessingProgress>>(
    new Map()
  );
  const isProcessingRef = useRef(false);

  const addToQueue = useCallback((recipeId: RecipeId): void => {
    setQueue((prev) => {
      if (prev.includes(recipeId)) {
        return prev;
      }
      return [...prev, recipeId];
    });
  }, []);

  const isProcessing = useCallback(
    (recipeId: RecipeId): boolean => {
      return currentlyProcessing === recipeId || queue.includes(recipeId);
    },
    [currentlyProcessing, queue]
  );

  const processingProgress = useCallback(
    (recipeId: RecipeId): ProcessingProgress | null => {
      return progress.get(recipeId) || null;
    },
    [progress]
  );

  const updateProgress = useCallback(
    (
      recipeId: RecipeId,
      phase: ProcessingProgress["phase"],
      progressValue: number
    ): void => {
      setProgress(
        (prev) =>
          new Map(
            prev.set(recipeId, {
              recipeId,
              phase,
              progress: progressValue,
            })
          )
      );
    },
    []
  );

  const processRecipe = useCallback(
    async (recipeId: RecipeId): Promise<void> => {
      try {
        console.log(
          `[Background Processing] Starting processing for ${recipeId}`
        );

        await updateProcessing(recipeId);
        setCurrentlyProcessing(recipeId);

        const recipe = await recipeRepository.getById(recipeId);
        if (!recipe) {
          console.error(`[Background Processing] Recipe ${recipeId} not found`);
          return;
        }

        const photoUri = await storage.getPhoto(recipeId);
        if (!photoUri) {
          console.error(
            `[Background Processing] Photo not found in storage for ${recipeId}`
          );
          return;
        }

        const photoDataUrl = await loadImageAsDataUrl(photoUri);

        updateProgress(recipeId, "geometry", 0);

        const result = await processPhoto(photoDataUrl, {
          ...DEFAULT_CONFIG,
          geometry: {
            ...DEFAULT_CONFIG.geometry,
            enabled: true,
          },
          lighting: {
            ...DEFAULT_CONFIG.lighting,
            enabled: true,
          },
          clarity: {
            ...DEFAULT_CONFIG.clarity,
            enabled: true,
          },
          ocr: {
            enabled: true,
          },
        });

        if (!result.success || !result.processedUri) {
          console.error(
            `[Background Processing] Processing failed for ${recipeId}:`,
            result.error
          );
          await updateComplete(recipeId, photoUri);
          return;
        }

        updateProgress(recipeId, "ocr", 80);

        let classificationResult;
        if (result.ocrResult?.text) {
          updateProgress(recipeId, "classification", 90);

          try {
            classificationResult = await classifyText(
              result.ocrResult.text,
              "embeddings"
            );

            if (classificationResult.suggestions.length === 0) {
              classificationResult = await classifyText(
                result.ocrResult.text,
                "tfidf"
              );
            }
          } catch (error) {
            console.warn(
              `[Background Processing] Classification failed for ${recipeId}:`,
              error
            );
          }
        }

        updateProgress(recipeId, "classification", 95);

        const tags = classificationResult?.suggestions
          ? classificationResult.suggestions
              .map((s) => s.tag)
              .filter(
                (tag): tag is `#${string}` =>
                  typeof tag === "string" && tag.startsWith("#")
              )
          : [];

        await updateComplete(
          recipeId,
          result.processedUri,
          result.ocrResult?.text,
          {
            title: classificationResult?.title,
            tags,
          }
        );

        updateProgress(recipeId, "classification", 100);
        console.log(
          `[Background Processing] Completed processing for ${recipeId}`
        );
      } catch (error) {
        console.error(
          `[Background Processing] Error processing ${recipeId}:`,
          error
        );
      } finally {
        setCurrentlyProcessing(null);
        setProgress((prev) => {
          const next = new Map(prev);
          next.delete(recipeId);
          return next;
        });
      }
    },
    [updateProgress, updateProcessing, updateComplete]
  );

  useEffect(() => {
    async function resumePendingRecipes(): Promise<void> {
      try {
        const pendingRecipes = await recipeRepository.getPendingRecipes();
        const pendingIds = pendingRecipes.map((r) => r.id);

        if (pendingIds.length > 0) {
          console.log(
            `[Background Processing] Resuming ${pendingIds.length} pending recipe(s)`
          );
          setQueue(pendingIds);
        }
      } catch (error) {
        console.error(
          "[Background Processing] Failed to resume pending recipes:",
          error
        );
      }
    }

    resumePendingRecipes();
  }, []);

  useEffect(() => {
    async function processQueue(): Promise<void> {
      if (isProcessingRef.current || queue.length === 0) {
        return;
      }

      isProcessingRef.current = true;
      const recipeId = queue[0];

      await processRecipe(recipeId);

      setQueue((prev) => prev.slice(1));
      isProcessingRef.current = false;
    }

    processQueue();
  }, [queue, processRecipe]);

  const value = useMemo(
    (): BackgroundProcessingContextValue => ({
      addToQueue,
      isProcessing,
      processingProgress,
      currentlyProcessing,
    }),
    [addToQueue, isProcessing, processingProgress, currentlyProcessing]
  );

  return (
    <BackgroundProcessingContext.Provider value={value}>
      {children}
    </BackgroundProcessingContext.Provider>
  );
}

export function useBackgroundProcessing(): BackgroundProcessingContextValue {
  const context = useContext(BackgroundProcessingContext);
  if (!context) {
    throw new Error(
      "useBackgroundProcessing must be used within BackgroundProcessingProvider"
    );
  }
  return context;
}

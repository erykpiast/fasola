import { recipeRepository } from "@/lib/repositories/recipes";
import type { RecipeMetadataWrite } from "@/lib/repositories/types";
import type { PhotoUri, RecipeId, SourceId } from "@/lib/types/primitives";
import type { Recipe } from "@/lib/types/recipe";
import {
  createContext,
  use,
  useCallback,
  useContext,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import { useTags } from "@/features/tags/context/TagsContext";

type RecipesContextValue = {
  recipes: Array<Recipe>;
  addRecipe: (
    photoUri: PhotoUri,
    metadata: RecipeMetadataWrite,
    recognizedText?: string
  ) => Promise<void>;
  savePending: (photoUri: PhotoUri, source?: SourceId) => Promise<Recipe>;
  updateRecipe: (id: RecipeId, metadata: RecipeMetadataWrite) => Promise<void>;
  updateProcessing: (id: RecipeId) => Promise<void>;
  updateComplete: (
    id: RecipeId,
    processedPhotoUri: PhotoUri,
    recognizedText?: string,
    classifiedMetadata?: Partial<RecipeMetadataWrite>
  ) => Promise<void>;
  deleteRecipe: (id: RecipeId) => Promise<void>;
  deleteRecipes: (ids: Array<RecipeId>) => Promise<void>;
  refreshFromStorage: () => Promise<void>;
};

const RecipesContext = createContext<RecipesContextValue | null>(null);

let recipesPromise: Promise<Array<Recipe>> | null = null;

function getRecipesPromise(): Promise<Array<Recipe>> {
  if (!recipesPromise) {
    recipesPromise = recipeRepository.getAll();
  }
  return recipesPromise;
}

export function RecipesProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const { refreshTags } = useTags();
  const initialRecipes = use(getRecipesPromise());
  const [recipes, setRecipes] = useState<Array<Recipe>>(initialRecipes);

  const addRecipe = useCallback(
    async (
      photoUri: PhotoUri,
      metadata: RecipeMetadataWrite,
      recognizedText?: string
    ) => {
      const newRecipe = await recipeRepository.save({
        photoUri,
        metadata,
        recognizedText,
        status: "ready",
      });
      setRecipes((prev) => [newRecipe, ...prev]);
      await refreshTags();
    },
    [refreshTags]
  );

  const savePending = useCallback(
    async (photoUri: PhotoUri, source?: SourceId): Promise<Recipe> => {
      const newRecipe = await recipeRepository.savePending(photoUri, source);
      setRecipes((prev) => [newRecipe, ...prev]);
      return newRecipe;
    },
    []
  );

  const updateRecipe = useCallback(
    async (id: RecipeId, metadata: RecipeMetadataWrite) => {
      const updatedRecipe = await recipeRepository.update(id, metadata);
      setRecipes((prev) =>
        prev.map((recipe) => (recipe.id === id ? updatedRecipe : recipe))
      );
      await refreshTags();
    },
    [refreshTags]
  );

  const updateProcessing = useCallback(async (id: RecipeId) => {
    await recipeRepository.updateProcessing(id);
    setRecipes((prev) =>
      prev.map((recipe) =>
        recipe.id === id ? { ...recipe, status: "processing" as const } : recipe
      )
    );
  }, []);

  const updateComplete = useCallback(
    async (
      id: RecipeId,
      processedPhotoUri: PhotoUri,
      recognizedText?: string,
      classifiedMetadata?: Partial<RecipeMetadataWrite>
    ) => {
      const updatedRecipe = await recipeRepository.updateComplete(
        id,
        processedPhotoUri,
        recognizedText,
        classifiedMetadata
      );
      setRecipes((prev) =>
        prev.map((recipe) => (recipe.id === id ? updatedRecipe : recipe))
      );
      await refreshTags();
    },
    [refreshTags]
  );

  const deleteRecipe = useCallback(async (id: RecipeId) => {
    await recipeRepository.delete(id);
    setRecipes((prev) => prev.filter((recipe) => recipe.id !== id));
    await refreshTags();
  }, [refreshTags]);

  const deleteRecipes = useCallback(
    async (ids: Array<RecipeId>): Promise<void> => {
      if (ids.length === 0) {
        return;
      }

      await recipeRepository.deleteMany(ids);
      const idsToDelete = new Set(ids);
      setRecipes((prev) => prev.filter((recipe) => !idsToDelete.has(recipe.id)));
      await refreshTags();
    },
    [refreshTags]
  );

  const refreshFromStorage = useCallback(async () => {
    const freshRecipes = await recipeRepository.getAll();
    setRecipes(freshRecipes);
    await refreshTags();
  }, [refreshTags]);

  const value = useMemo(
    (): RecipesContextValue => ({
      recipes,
      addRecipe,
      savePending,
      updateRecipe,
      updateProcessing,
      updateComplete,
      deleteRecipe,
      deleteRecipes,
      refreshFromStorage,
    }),
    [
      recipes,
      addRecipe,
      savePending,
      updateRecipe,
      updateProcessing,
      updateComplete,
      deleteRecipe,
      deleteRecipes,
      refreshFromStorage,
    ]
  );

  return (
    <RecipesContext.Provider
      value={value}
    >
      {children}
    </RecipesContext.Provider>
  );
}

export function useRecipes(): RecipesContextValue {
  const context = useContext(RecipesContext);
  if (!context) {
    throw new Error("useRecipes must be used within RecipesProvider");
  }
  return context;
}

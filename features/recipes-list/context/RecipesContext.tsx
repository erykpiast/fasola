import { recipeRepository } from "@/lib/repositories/recipes";
import type { PhotoUri, RecipeId, SourceId } from "@/lib/types/primitives";
import type { Recipe, RecipeMetadata } from "@/lib/types/recipe";
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

type RecipesContextValue = {
  recipes: Array<Recipe>;
  addRecipe: (
    photoUri: PhotoUri,
    metadata: RecipeMetadata,
    recognizedText?: string
  ) => Promise<void>;
  savePending: (photoUri: PhotoUri, source?: SourceId) => Promise<Recipe>;
  updateRecipe: (id: string, metadata: RecipeMetadata) => Promise<void>;
  updateProcessing: (id: RecipeId) => Promise<void>;
  updateComplete: (
    id: RecipeId,
    processedPhotoUri: string,
    recognizedText?: string,
    classifiedMetadata?: Partial<RecipeMetadata>
  ) => Promise<void>;
  deleteRecipe: (id: RecipeId) => Promise<void>;
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
  const initialRecipes = use(getRecipesPromise());
  const [recipes, setRecipes] = useState<Array<Recipe>>(initialRecipes);

  const addRecipe = useCallback(
    async (
      photoUri: PhotoUri,
      metadata: RecipeMetadata,
      recognizedText?: string
    ) => {
      const newRecipe = await recipeRepository.save({
        photoUri,
        metadata,
        recognizedText,
        status: "ready",
      });
      setRecipes((prev) => [newRecipe, ...prev]);
    },
    []
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
    async (id: string, metadata: RecipeMetadata) => {
      const updatedRecipe = await recipeRepository.update(id, metadata);
      setRecipes((prev) =>
        prev.map((recipe) => (recipe.id === id ? updatedRecipe : recipe))
      );
    },
    []
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
      processedPhotoUri: string,
      recognizedText?: string,
      classifiedMetadata?: Partial<RecipeMetadata>
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
    },
    []
  );

  const deleteRecipe = useCallback(async (id: RecipeId) => {
    await recipeRepository.delete(id);
    setRecipes((prev) => prev.filter((recipe) => recipe.id !== id));
  }, []);

  const refreshFromStorage = useCallback(async () => {
    const freshRecipes = await recipeRepository.getAll();
    setRecipes(freshRecipes);
  }, []);

  const value = useMemo(
    (): RecipesContextValue => ({
      recipes,
      addRecipe,
      savePending,
      updateRecipe,
      updateProcessing,
      updateComplete,
      deleteRecipe,
      refreshFromStorage,
    }),
    [recipes, addRecipe, savePending, updateRecipe, updateProcessing, updateComplete, deleteRecipe, refreshFromStorage]
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

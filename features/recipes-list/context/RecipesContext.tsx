import type { Recipe, RecipeMetadata } from "@/lib/types/recipe";
import type { PhotoUri } from "@/lib/types/primitives";
import { recipeRepository } from "@/lib/repositories/recipes";
import {
  createContext,
  use,
  useCallback,
  useContext,
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
  updateRecipe: (id: string, metadata: RecipeMetadata) => Promise<void>;
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
      });
      setRecipes((prev) => [newRecipe, ...prev]);
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

  return (
    <RecipesContext.Provider value={{ recipes, addRecipe, updateRecipe }}>
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

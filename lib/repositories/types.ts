import type { RecipeId } from "../types/primitives";
import type { Recipe, RecipeMetadata } from "../types/recipe";

export interface RecipeRepository {
  getAll(): Promise<Array<Recipe>>;
  getById(id: RecipeId): Promise<Recipe | null>;
  save(recipe: Omit<Recipe, "id" | "timestamp">): Promise<Recipe>;
  update(id: RecipeId, metadata: RecipeMetadata): Promise<Recipe>;
  delete(id: RecipeId): Promise<void>;
  savePending(originalPhotoUri: string, source?: string): Promise<Recipe>;
  updateProcessing(id: RecipeId): Promise<void>;
  updateComplete(
    id: RecipeId,
    processedPhotoUri: string,
    recognizedText?: string,
    classifiedMetadata?: Partial<RecipeMetadata>
  ): Promise<Recipe>;
  getPendingRecipes(): Promise<Array<Recipe>>;
}

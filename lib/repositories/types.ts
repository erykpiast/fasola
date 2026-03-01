import type { PhotoUri, RecipeId, SourceId, TagId } from "../types/primitives";
import type { Recipe, RecipeMetadata } from "../types/recipe";

export interface RecipeMetadataWrite {
  title?: string;
  source?: RecipeMetadata["source"];
  tags?: Array<`#${string}`>;
  tagIds?: Array<TagId>;
}

export interface RecipeRepository {
  getAll(): Promise<Array<Recipe>>;
  getById(id: RecipeId): Promise<Recipe | null>;
  save(
    recipe: Omit<Recipe, "id" | "timestamp" | "metadata"> & {
      metadata: RecipeMetadataWrite;
    }
  ): Promise<Recipe>;
  update(id: RecipeId, metadata: RecipeMetadataWrite): Promise<Recipe>;
  delete(id: RecipeId): Promise<void>;
  deleteMany(ids: Array<RecipeId>): Promise<void>;
  savePending(originalPhotoUri: PhotoUri, source?: SourceId): Promise<Recipe>;
  updateProcessing(id: RecipeId): Promise<void>;
  updateComplete(
    id: RecipeId,
    processedPhotoUri: PhotoUri,
    recognizedText?: string,
    classifiedMetadata?: Partial<RecipeMetadataWrite>
  ): Promise<Recipe>;
  getPendingRecipes(): Promise<Array<Recipe>>;
}

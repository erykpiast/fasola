import type { Recipe, RecipeMetadata } from "../types/recipe";
import type { RecipeId } from "../types/primitives";

export interface RecipeRepository {
  getAll(): Promise<Recipe[]>;
  getById(id: RecipeId): Promise<Recipe | null>;
  save(recipe: Omit<Recipe, "id" | "timestamp">): Promise<Recipe>;
  update(id: RecipeId, metadata: RecipeMetadata): Promise<Recipe>;
  delete(id: RecipeId): Promise<void>;
}

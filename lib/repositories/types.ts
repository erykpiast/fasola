import type { Recipe, RecipeMetadata } from "../types/recipe";

export interface RecipeRepository {
  getAll(): Promise<Recipe[]>;
  getById(id: string): Promise<Recipe | null>;
  save(recipe: Omit<Recipe, "id" | "timestamp">): Promise<Recipe>;
  update(id: string, metadata: RecipeMetadata): Promise<Recipe>;
  delete(id: string): Promise<void>;
}

import * as Crypto from "expo-crypto";
import { storage } from "../storage";
import type { Recipe, RecipeMetadata } from "../types/recipe";
import { migrateIfNeeded } from "./photosToRecipesMigration";
import type { RecipeRepository } from "./types";
import type { RecipeId, StorageKey } from "../types/primitives";

const RECIPES_KEY: StorageKey = "@recipes";

class AsyncStorageRecipeRepository implements RecipeRepository {
  async getAll(): Promise<Array<Recipe>> {
    await migrateIfNeeded(RECIPES_KEY);

    const data = await storage.getItem(RECIPES_KEY);
    if (!data) {
      return [];
    }

    const recipes: Array<Recipe> = JSON.parse(data);

    const recipesWithUris = await Promise.all(
      recipes.map(async (recipe) => {
        const photoUri = await storage.getPhoto(recipe.id);
        return {
          ...recipe,
          photoUri: photoUri || recipe.photoUri,
        };
      })
    );

    return recipesWithUris.sort((a, b) => b.timestamp - a.timestamp);
  }

  async getById(id: RecipeId): Promise<Recipe | null> {
    const recipes = await this.getAll();
    return recipes.find((r) => r.id === id) || null;
  }

  async save(recipe: Omit<Recipe, "id" | "timestamp">): Promise<Recipe> {
    const id = Crypto.randomUUID();
    const timestamp = Date.now();

    await storage.savePhoto(id, recipe.photoUri, timestamp);

    const newRecipe: Recipe = {
      id,
      photoUri: id,
      timestamp,
      metadata: recipe.metadata,
    };

    const data = await storage.getItem(RECIPES_KEY);
    const recipes: Array<Recipe> = data ? JSON.parse(data) : [];
    recipes.push(newRecipe);
    await storage.setItem(RECIPES_KEY, JSON.stringify(recipes));

    const photoUri = await storage.getPhoto(id);
    return {
      ...newRecipe,
      photoUri: photoUri || id,
    };
  }

  async update(id: RecipeId, metadata: RecipeMetadata): Promise<Recipe> {
    const recipes = await this.getAll();
    const index = recipes.findIndex((r) => r.id === id);

    if (index === -1) {
      throw new Error(`Recipe with id ${id} not found`);
    }

    recipes[index] = {
      ...recipes[index],
      metadata,
    };

    await storage.setItem(RECIPES_KEY, JSON.stringify(recipes));
    return recipes[index];
  }

  async delete(id: RecipeId): Promise<void> {
    await storage.deletePhoto(id);

    const recipes = await this.getAll();
    const filtered = recipes.filter((r) => r.id !== id);
    await storage.setItem(RECIPES_KEY, JSON.stringify(filtered));
  }
}

export const recipeRepository = new AsyncStorageRecipeRepository();

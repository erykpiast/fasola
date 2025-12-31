import { storage } from "../storage";
import type { PhotoUri, RecipeId, StorageKey } from "../types/primitives";
import type { Recipe } from "../types/recipe";

const LEGACY_PHOTOS_KEY: StorageKey = "@photos";

interface LegacyPhoto {
  id: RecipeId;
  uri: PhotoUri;
  timestamp: number;
}

export async function migrateIfNeeded(newKey: StorageKey): Promise<void> {
  const [recipes, photos] = await Promise.all([
    storage.getItem(newKey),
    storage.getItem(LEGACY_PHOTOS_KEY),
  ]);

  if (!recipes && photos) {
    const oldPhotos = JSON.parse(photos) as Array<LegacyPhoto>;
    const newRecipes: Array<Recipe> = oldPhotos.map((photo: LegacyPhoto) => ({
      id: photo.id,
      photoUri: photo.uri,
      timestamp: photo.timestamp,
      metadata: { tags: [] },
      status: "ready" as const,
    }));
    await storage.setItem(newKey, JSON.stringify(newRecipes));
    await storage.removeItem(LEGACY_PHOTOS_KEY);
  }

  if (recipes) {
    const existingRecipes = JSON.parse(recipes) as Array<Recipe>;
    let needsUpdate = false;

    const updatedRecipes = existingRecipes.map((recipe) => {
      if (!recipe.status) {
        needsUpdate = true;
        return {
          ...recipe,
          status: "ready" as const,
        };
      }
      return recipe;
    });

    if (needsUpdate) {
      await storage.setItem(newKey, JSON.stringify(updatedRecipes));
    }
  }
}

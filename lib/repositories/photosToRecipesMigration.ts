import { storage } from "../storage";
import type { Recipe } from "../types/recipe";
import type { StorageKey } from "../types/primitives";

const LEGACY_PHOTOS_KEY: StorageKey = "@photos";

export async function migrateIfNeeded(newKey: StorageKey): Promise<void> {
  const [recipes, photos] = await Promise.all([
    storage.getItem(newKey),
    storage.getItem(LEGACY_PHOTOS_KEY),
  ]);

  if (!recipes && photos) {
    const oldPhotos = JSON.parse(photos);
    const newRecipes: Recipe[] = oldPhotos.map((photo: any) => ({
      id: photo.id,
      photoUri: photo.uri,
      timestamp: photo.timestamp,
      metadata: { tags: [] },
    }));
    await storage.setItem(newKey, JSON.stringify(newRecipes));
    await storage.removeItem(LEGACY_PHOTOS_KEY);
  }
}

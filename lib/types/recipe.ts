import type { PhotoUri, RecipeId } from "./primitives";

export interface Recipe {
  id: RecipeId;
  photoUri: PhotoUri;
  timestamp: number;
  metadata: RecipeMetadata;
}

export interface RecipeMetadata {
  title?: string;
  source?: `https://${string}` | `http://${string}` | string;
  tags: Array<`#${string}`>;
}

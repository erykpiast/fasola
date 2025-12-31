import type { PhotoUri, RecipeId } from "./primitives";

export interface Recipe {
  id: RecipeId;
  photoUri: PhotoUri;
  originalPhotoUri?: PhotoUri;
  timestamp: number;
  metadata: RecipeMetadata;
  recognizedText?: string;
  status: "pending" | "processing" | "ready";
}

export interface RecipeMetadata {
  title?: string;
  source?: `https://${string}` | `http://${string}` | string;
  tags: Array<`#${string}`>;
}

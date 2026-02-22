import type { PhotoUri, RecipeId, SourceId } from "./primitives";

export interface Recipe {
  id: RecipeId;
  photoUri: PhotoUri;
  thumbnailUri?: PhotoUri;
  originalPhotoUri?: PhotoUri;
  timestamp: number;
  metadata: RecipeMetadata;
  recognizedText?: string;
  status: "pending" | "processing" | "ready";
}

export interface RecipeMetadata {
  title?: string;
  source?: SourceId | `https://${string}` | `http://${string}`;
  tags: Array<`#${string}`>;
}

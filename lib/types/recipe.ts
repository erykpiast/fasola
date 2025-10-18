export interface Recipe {
  id: string;
  photoUri: string;
  timestamp: number;
  metadata: RecipeMetadata;
}

export interface RecipeMetadata {
  title?: string;
  source?: `https://${string}` | `http://${string}` | string;
  tags: Array<`#${string}`>;
}

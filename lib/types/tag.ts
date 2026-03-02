import type { TagId } from "./primitives";

export interface Tag {
  id: TagId;
  label: `#${string}`;
  normalizedLabel: string;
  recipeCount: number;
  lastUsedAt: number;
}

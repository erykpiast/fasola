import type { AppLanguage } from "./language";
import type { SourceId } from "./primitives";

export interface Source {
  id: SourceId;
  name: string;
  language: AppLanguage;
  lastUsedAt: number;
}

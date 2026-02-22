import type { SourceId } from "./primitives";

export interface Source {
  id: SourceId;
  name: string;
  lastUsedAt: number;
}

import type { PhotoId, PhotoUri } from "@/lib/types/primitives";

export interface Photo {
  id: PhotoId;
  uri: PhotoUri;
  timestamp: number;
  title?: string;
}

import type { PhotoId, PhotoUri, StorageKey } from "../types/primitives";

export interface PhotoMetadata {
  id: PhotoId;
  timestamp: number;
}

export interface PhotoWithUri extends PhotoMetadata {
  uri: PhotoUri;
}

export interface Storage {
  getPhotos(): Promise<PhotoWithUri[]>;
  savePhoto(id: PhotoId, uri: PhotoUri, timestamp: number): Promise<PhotoId>;
  getPhoto(id: PhotoId): Promise<PhotoUri | null>;
  deletePhoto(id: PhotoId): Promise<void>;
  getItem(key: StorageKey): Promise<string | null>;
  setItem(key: StorageKey, value: string): Promise<void>;
  removeItem(key: StorageKey): Promise<void>;
}

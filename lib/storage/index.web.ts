import localforage from "localforage";
import type { PhotoMetadata, PhotoWithUri, Storage } from "./types";
import type { PhotoId, PhotoUri, StorageKey } from "../types/primitives";

export type { PhotoMetadata, PhotoWithUri, Storage } from "./types";

localforage.config({
  name: "fasola-photos",
  storeName: "photos",
});

const METADATA_KEY = "__metadata__";

class WebStorage implements Storage {
  private async getMetadata(): Promise<Record<string, PhotoMetadata>> {
    const metadata = await localforage.getItem<Record<string, PhotoMetadata>>(
      METADATA_KEY
    );
    return metadata || {};
  }

  private async saveMetadata(
    metadata: Record<string, PhotoMetadata>
  ): Promise<void> {
    await localforage.setItem(METADATA_KEY, metadata);
  }

  async getPhotos(): Promise<Array<PhotoWithUri>> {
    const metadata = await this.getMetadata();
    const photos: Array<PhotoWithUri> = [];

    for (const [id, data] of Object.entries(metadata)) {
      const uri = await this.getPhoto(id);
      if (uri) {
        photos.push({
          id: data.id,
          timestamp: data.timestamp,
          uri,
        });
      }
    }

    return photos.sort((a, b) => b.timestamp - a.timestamp);
  }

  async savePhoto(id: PhotoId, uri: PhotoUri, timestamp: number): Promise<PhotoId> {
    const response = await fetch(uri);
    const blob = await response.blob();
    await localforage.setItem(id, blob);

    const metadata = await this.getMetadata();
    metadata[id] = { id, timestamp };
    await this.saveMetadata(metadata);

    return id;
  }

  async getPhoto(id: PhotoId): Promise<PhotoUri | null> {
    const blob = await localforage.getItem<Blob>(id);
    if (blob && blob instanceof Blob) {
      return URL.createObjectURL(blob);
    }
    return null;
  }

  async deletePhoto(id: PhotoId): Promise<void> {
    await localforage.removeItem(id);

    const metadata = await this.getMetadata();
    delete metadata[id];
    await this.saveMetadata(metadata);
  }

  async saveThumbnail(id: PhotoId, sourceUri: PhotoUri): Promise<void> {
    const { generateThumbnail } = await import("../thumbnails/generate");
    const thumbnailDataUrl = await generateThumbnail(sourceUri);
    const response = await fetch(thumbnailDataUrl);
    const blob = await response.blob();
    await localforage.setItem(`${id}_thumb`, blob);
  }

  async getThumbnail(id: PhotoId): Promise<PhotoUri | null> {
    const blob = await localforage.getItem<Blob>(`${id}_thumb`);
    if (blob && blob instanceof Blob) {
      return URL.createObjectURL(blob);
    }
    return null;
  }

  async deleteThumbnail(id: PhotoId): Promise<void> {
    await localforage.removeItem(`${id}_thumb`);
  }

  async getItem(key: StorageKey): Promise<string | null> {
    const value = await localforage.getItem<string>(key);
    return value ?? null;
  }

  async setItem(key: StorageKey, value: string): Promise<void> {
    await localforage.setItem(key, value);
  }

  async removeItem(key: StorageKey): Promise<void> {
    await localforage.removeItem(key);
  }
}

export const storage = new WebStorage();

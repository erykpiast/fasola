import localforage from "localforage";
import type { PhotoMetadata, PhotoWithUri, Storage } from "./types";

localforage.config({
  name: "fasola-photos",
  storeName: "photos",
});

const METADATA_KEY = "__metadata__";

export class WebStorage implements Storage {
  async #getMetadata(): Promise<Record<string, PhotoMetadata>> {
    const metadata = await localforage.getItem<Record<string, PhotoMetadata>>(
      METADATA_KEY
    );
    return metadata || {};
  }

  async #saveMetadata(metadata: Record<string, PhotoMetadata>): Promise<void> {
    await localforage.setItem(METADATA_KEY, metadata);
  }

  async getPhotos(): Promise<PhotoWithUri[]> {
    const metadata = await this.#getMetadata();
    const photos: PhotoWithUri[] = [];

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

  async savePhoto(id: string, uri: string, timestamp: number): Promise<string> {
    const response = await fetch(uri);
    const blob = await response.blob();
    await localforage.setItem(id, blob);

    const metadata = await this.#getMetadata();
    metadata[id] = { id, timestamp };
    await this.#saveMetadata(metadata);

    const savedUri = await this.getPhoto(id);
    return savedUri || uri;
  }

  async getPhoto(id: string): Promise<string | null> {
    const blob = await localforage.getItem<Blob>(id);
    if (blob) {
      return URL.createObjectURL(blob);
    }
    return null;
  }

  async deletePhoto(id: string): Promise<void> {
    await localforage.removeItem(id);

    const metadata = await this.#getMetadata();
    delete metadata[id];
    await this.#saveMetadata(metadata);
  }
}

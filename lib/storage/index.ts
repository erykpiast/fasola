import { Platform } from "react-native";
import type { PhotoWithUri, Storage } from "./types";

export type { PhotoMetadata, PhotoWithUri, Storage } from "./types";

const storagePromise =
  Platform.OS === "web"
    ? import("./web").then((m) => m.WebStorage)
    : import("./native").then((m) => m.NativeStorage);

let storageInstance: Storage | null = null;

export const storage: Storage = {
  async getPhotos(): Promise<PhotoWithUri[]> {
    if (!storageInstance) {
      const StorageClass = await storagePromise;
      storageInstance = new StorageClass();
    }
    return storageInstance.getPhotos();
  },

  async savePhoto(id: string, uri: string, timestamp: number): Promise<string> {
    if (!storageInstance) {
      const StorageClass = await storagePromise;
      storageInstance = new StorageClass();
    }
    return storageInstance.savePhoto(id, uri, timestamp);
  },

  async getPhoto(id: string): Promise<string | null> {
    if (!storageInstance) {
      const StorageClass = await storagePromise;
      storageInstance = new StorageClass();
    }
    return storageInstance.getPhoto(id);
  },

  async deletePhoto(id: string): Promise<void> {
    if (!storageInstance) {
      const StorageClass = await storagePromise;
      storageInstance = new StorageClass();
    }
    return storageInstance.deletePhoto(id);
  },

  async getItem(key: string): Promise<string | null> {
    if (!storageInstance) {
      const StorageClass = await storagePromise;
      storageInstance = new StorageClass();
    }
    return storageInstance.getItem(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (!storageInstance) {
      const StorageClass = await storagePromise;
      storageInstance = new StorageClass();
    }
    return storageInstance.setItem(key, value);
  },

  async removeItem(key: string): Promise<void> {
    if (!storageInstance) {
      const StorageClass = await storagePromise;
      storageInstance = new StorageClass();
    }
    return storageInstance.removeItem(key);
  },
};

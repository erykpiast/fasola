import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import type { PhotoMetadata, PhotoWithUri, Storage } from "./types";
import type { PhotoId, PhotoUri, StorageKey } from "../types/primitives";

export type { PhotoMetadata, PhotoWithUri, Storage } from "./types";

class NativeStorage implements Storage {
  private photosDirectory = new Directory(Paths.document, "photos");
  private metadataFile = new File(Paths.document, "photos/metadata.json");

  private async ensurePhotosDirectory(): Promise<void> {
    if (!this.photosDirectory.exists) {
      this.photosDirectory.create({ intermediates: true });
    }
  }

  private async getMetadata(): Promise<Record<string, PhotoMetadata>> {
    if (!this.metadataFile.exists) {
      return {};
    }
    const content = await this.metadataFile.text();
    return JSON.parse(content);
  }

  private async saveMetadata(
    metadata: Record<string, PhotoMetadata>
  ): Promise<void> {
    await this.ensurePhotosDirectory();
    await this.metadataFile.write(JSON.stringify(metadata));
  }

  async getPhotos(): Promise<PhotoWithUri[]> {
    const metadata = await this.getMetadata();
    const photos: PhotoWithUri[] = [];

    for (const [id, data] of Object.entries(metadata)) {
      const filename = `${id}.jpg`;
      const file = new File(this.photosDirectory.uri, filename);
      if (file.exists) {
        photos.push({
          id: data.id,
          timestamp: data.timestamp,
          uri: file.uri,
        });
      }
    }

    return photos.sort((a, b) => b.timestamp - a.timestamp);
  }

  async savePhoto(id: PhotoId, uri: PhotoUri, timestamp: number): Promise<PhotoId> {
    await this.ensurePhotosDirectory();
    const filename = `${id}.jpg`;

    const sourceFile = new File(uri);
    const destinationFile = new File(this.photosDirectory.uri, filename);
    sourceFile.copy(destinationFile);

    const metadata = await this.getMetadata();
    metadata[id] = { id, timestamp };
    await this.saveMetadata(metadata);

    return id;
  }

  async getPhoto(id: PhotoId): Promise<PhotoUri | null> {
    const filename = `${id}.jpg`;
    const file = new File(this.photosDirectory.uri, filename);
    return file.exists ? file.uri : null;
  }

  async deletePhoto(id: PhotoId): Promise<void> {
    const filename = `${id}.jpg`;
    const file = new File(this.photosDirectory.uri, filename);
    if (file.exists) {
      file.delete();
    }

    const metadata = await this.getMetadata();
    delete metadata[id];
    await this.saveMetadata(metadata);
  }

  async getItem(key: StorageKey): Promise<string | null> {
    return AsyncStorage.getItem(key);
  }

  async setItem(key: StorageKey, value: string): Promise<void> {
    await AsyncStorage.setItem(key, value);
  }

  async removeItem(key: StorageKey): Promise<void> {
    await AsyncStorage.removeItem(key);
  }
}

export const storage = new NativeStorage();

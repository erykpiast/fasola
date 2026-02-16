import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import {
  getContainerUrl,
  migrateToContainer,
} from "icloud-sync";
import type { PhotoMetadata, PhotoWithUri, Storage } from "./types";
import type { PhotoId, PhotoUri, StorageKey } from "../types/primitives";

export type { PhotoMetadata, PhotoWithUri, Storage } from "./types";

function sanitizeKey(key: StorageKey): string {
  return key.replace(/^@/, "");
}

class NativeStorage implements Storage {
  private basePath: string | null = null;
  private initPromise: Promise<void> | null = null;

  private getPhotosDirectory(): Directory {
    return new Directory(this.basePath!, "photos");
  }

  private getMetadataFile(): File {
    return new File(this.basePath!, "photos/metadata.json");
  }

  private getDataDirectory(): Directory {
    return new Directory(this.basePath!, "data");
  }

  private async init(): Promise<void> {
    if (this.basePath) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.performInit();
    return this.initPromise;
  }

  private async performInit(): Promise<void> {
    const containerUrl = getContainerUrl();

    if (containerUrl) {
      this.basePath = containerUrl;
      await this.ensureDirectories();
      await this.migrateFromAsyncStorage();
    } else {
      this.basePath = Paths.document.uri;
      await this.ensureDirectories();
    }
  }

  private async ensureDirectories(): Promise<void> {
    const photosDir = this.getPhotosDirectory();
    if (!photosDir.exists) {
      photosDir.create({ intermediates: true });
    }
    const dataDir = this.getDataDirectory();
    if (!dataDir.exists) {
      dataDir.create({ intermediates: true });
    }
  }

  private async migrateFromAsyncStorage(): Promise<void> {
    const sentinel = new File(this.basePath!, "data/.migration-complete");
    if (sentinel.exists) return;

    const asyncStorageData = await AsyncStorage.getItem("@recipes");
    if (!asyncStorageData) {
      await sentinel.write("1");
      return;
    }

    // Write recipes data to file-based storage
    const recipesFile = new File(this.basePath!, "data/recipes.json");
    await recipesFile.write(asyncStorageData);

    // Copy photos from local documents to ubiquity container
    const localDocUri = Paths.document.uri;
    try {
      await migrateToContainer(localDocUri, this.basePath!);
    } catch (e) {
      console.warn("[Storage] Photo migration failed, photos will re-sync:", e);
    }

    // Clear AsyncStorage to prevent re-migration
    await AsyncStorage.removeItem("@recipes");
    await sentinel.write("1");
  }

  private async getMetadata(): Promise<Record<string, PhotoMetadata>> {
    const metadataFile = this.getMetadataFile();
    if (!metadataFile.exists) {
      return {};
    }
    const content = await metadataFile.text();
    return JSON.parse(content);
  }

  private async saveMetadata(
    metadata: Record<string, PhotoMetadata>
  ): Promise<void> {
    const metadataFile = this.getMetadataFile();
    await metadataFile.write(JSON.stringify(metadata));
  }

  async getPhotos(): Promise<Array<PhotoWithUri>> {
    await this.init();
    const metadata = await this.getMetadata();
    const photos: Array<PhotoWithUri> = [];
    const photosDir = this.getPhotosDirectory();

    for (const [id, data] of Object.entries(metadata)) {
      const filename = `${id}.jpg`;
      const file = new File(photosDir.uri, filename);
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

  async savePhoto(
    id: PhotoId,
    uri: PhotoUri,
    timestamp: number
  ): Promise<PhotoId> {
    await this.init();
    const photosDir = this.getPhotosDirectory();
    const filename = `${id}.jpg`;
    const destinationFile = new File(photosDir.uri, filename);

    if (uri.startsWith("data:")) {
      const base64Match = uri.match(/^data:[^;]+;base64,(.+)$/);
      if (!base64Match) {
        throw new Error("Invalid data URL format");
      }
      const base64Data = base64Match[1];
      if (destinationFile.exists) {
        destinationFile.delete();
      }
      await destinationFile.write(base64Data, { encoding: "base64" });
    } else {
      const sourceFile = new File(uri);
      if (sourceFile.uri !== destinationFile.uri) {
        if (destinationFile.exists) {
          destinationFile.delete();
        }
        sourceFile.copy(destinationFile);
      }
    }

    const metadata = await this.getMetadata();
    metadata[id] = { id, timestamp };
    await this.saveMetadata(metadata);

    return id;
  }

  async getPhoto(id: PhotoId): Promise<PhotoUri | null> {
    await this.init();
    const photosDir = this.getPhotosDirectory();
    const filename = `${id}.jpg`;
    const file = new File(photosDir.uri, filename);
    return file.exists ? file.uri : null;
  }

  async deletePhoto(id: PhotoId): Promise<void> {
    await this.init();
    const photosDir = this.getPhotosDirectory();
    const filename = `${id}.jpg`;
    const file = new File(photosDir.uri, filename);
    if (file.exists) {
      file.delete();
    }

    const metadata = await this.getMetadata();
    delete metadata[id];
    await this.saveMetadata(metadata);
  }

  async getItem(key: StorageKey): Promise<string | null> {
    await this.init();
    const sanitized = sanitizeKey(key);
    const file = new File(this.getDataDirectory().uri, `${sanitized}.json`);
    if (!file.exists) {
      return null;
    }
    return file.text();
  }

  async setItem(key: StorageKey, value: string): Promise<void> {
    await this.init();
    const sanitized = sanitizeKey(key);
    const file = new File(this.getDataDirectory().uri, `${sanitized}.json`);
    await file.write(value);
  }

  async removeItem(key: StorageKey): Promise<void> {
    await this.init();
    const sanitized = sanitizeKey(key);
    const file = new File(this.getDataDirectory().uri, `${sanitized}.json`);
    if (file.exists) {
      file.delete();
    }
  }
}

export const storage: Storage = new NativeStorage();

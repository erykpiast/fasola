export interface PhotoMetadata {
  id: string;
  timestamp: number;
}

export interface PhotoWithUri extends PhotoMetadata {
  uri: string;
}

export interface Storage {
  getPhotos(): Promise<PhotoWithUri[]>;
  savePhoto(id: string, uri: string, timestamp: number): Promise<string>;
  getPhoto(id: string): Promise<string | null>;
  deletePhoto(id: string): Promise<void>;
}

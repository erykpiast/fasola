import { use, useState } from "react";
import { storage } from "../../../lib/storage";
import { Photo } from "../types";

let photosPromise: Promise<Photo[]> | null = null;

function getPhotosPromise(): Promise<Photo[]> {
  if (!photosPromise) {
    photosPromise = storage.getPhotos();
  }
  return photosPromise;
}

export function usePhotos() {
  const initialPhotos = use(getPhotosPromise());
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);

  const addPhoto = async (uri: string) => {
    const timestamp = Date.now();
    const id = `${timestamp}`;
    const photoUri = await storage.savePhoto(id, uri, timestamp);
    setPhotos((prev) => [
      ...prev,
      {
        id,
        uri: photoUri,
        timestamp,
      },
    ]);
    photosPromise = null;
  };

  const deletePhoto = async (id: string) => {
    await storage.deletePhoto(id);
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    photosPromise = null;
  };

  return {
    photos,
    addPhoto,
    deletePhoto,
  };
}

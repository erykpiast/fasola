import { use, useState, useEffect } from 'react';
import { getPhotos, savePhoto, deletePhoto as removePhoto } from '../../../lib/storage';
import { Photo } from '../types';

let photosPromise: Promise<Photo[]> | null = null;

function getPhotosPromise(): Promise<Photo[]> {
  if (!photosPromise) {
    photosPromise = getPhotos();
  }
  return photosPromise;
}

export function usePhotos() {
  const initialPhotos = use(getPhotosPromise());
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);

  const addPhoto = async (uri: string) => {
    const photo = await savePhoto(uri);
    setPhotos(prev => [...prev, photo]);
    photosPromise = null;
  };

  const deletePhoto = async (id: string) => {
    await removePhoto(id);
    setPhotos(prev => prev.filter(p => p.id !== id));
    photosPromise = null;
  };

  return {
    photos,
    addPhoto,
    deletePhoto,
  };
}

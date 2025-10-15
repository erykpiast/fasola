import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Directory, Paths } from 'expo-file-system';
import { Photo } from '../features/photos/types';

const PHOTOS_KEY = '@photos';
const photosDirectory = new Directory(Paths.document, 'photos');

async function ensurePhotosDirectory() {
  if (!photosDirectory.exists) {
    photosDirectory.create({ intermediates: true });
  }
}

export async function savePhoto(uri: string): Promise<Photo> {
  await ensurePhotosDirectory();

  const timestamp = Date.now();
  const id = `${timestamp}`;
  const filename = `${id}.jpg`;

  const sourceFile = new File(uri);
  const destinationFile = new File(photosDirectory.uri, filename);
  sourceFile.copy(destinationFile);

  const photo: Photo = {
    id,
    uri: destinationFile.uri,
    timestamp,
  };

  const photos = await getPhotos();
  photos.push(photo);
  await AsyncStorage.setItem(PHOTOS_KEY, JSON.stringify(photos));

  return photo;
}

export async function getPhotos(): Promise<Photo[]> {
  const data = await AsyncStorage.getItem(PHOTOS_KEY);
  return data ? JSON.parse(data) : [];
}

export async function deletePhoto(id: string): Promise<void> {
  const photos = await getPhotos();
  const photo = photos.find(p => p.id === id);

  if (photo) {
    const fileToDelete = new File(photo.uri);
    if (fileToDelete.exists) {
      fileToDelete.delete();
    }
    const filtered = photos.filter(p => p.id !== id);
    await AsyncStorage.setItem(PHOTOS_KEY, JSON.stringify(filtered));
  }
}

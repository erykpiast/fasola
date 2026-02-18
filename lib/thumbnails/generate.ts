import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import type { PhotoUri } from "../types/primitives";

const THUMBNAIL_MAX_DIMENSION = 400;
const THUMBNAIL_QUALITY = 0.7;

export async function generateThumbnail(
  sourceUri: PhotoUri
): Promise<PhotoUri> {
  const result = await manipulateAsync(
    sourceUri,
    [{ resize: { width: THUMBNAIL_MAX_DIMENSION } }],
    { compress: THUMBNAIL_QUALITY, format: SaveFormat.JPEG }
  );
  return result.uri;
}

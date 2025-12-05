import type { DataUrl } from "@/lib/types/primitives";
import { File } from "expo-file-system";

/**
 * Load an image URI as a data URL (native implementation)
 */
export async function loadImageAsDataUrl(uri: string): Promise<DataUrl> {
  try {
    const file = new File(uri);
    const base64 = await file.base64();

    // Determine MIME type from extension or default to jpeg
    const mimeType = uri.toLowerCase().endsWith(".png")
      ? "image/png"
      : "image/jpeg";

    return `data:${mimeType};base64,${base64}` as DataUrl;
  } catch (error) {
    console.error("Failed to load image as data URL:", error);
    throw new Error("Failed to load image file");
  }
}

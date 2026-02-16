import type { DataUrl } from "@/lib/types/primitives";

/**
 * Convert a data URL to ImageData
 * Works in both browser and WebView contexts
 */
export async function dataUrlToImageData(dataUrl: DataUrl): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = (): void => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Failed to get 2D context");
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        resolve(imageData);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = (): void => {
      reject(new Error("Failed to load image from data URL"));
    };

    img.src = dataUrl;
  });
}

/**
 * Convert ImageData to a data URL
 * Works in both browser and WebView contexts
 */
export function imageDataToDataUrl(
  imageData: ImageData,
  quality: number = 0.92
): DataUrl {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2D context");
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/jpeg", quality) as DataUrl;
}

/**
 * Load an image from a URI and convert to data URL
 * Handles both file:// and http(s):// URIs
 */
export async function loadImageAsDataUrl(uri: string): Promise<DataUrl> {
  // For web, we can use fetch + FileReader
  if (typeof window !== "undefined") {
    const response = await fetch(uri);
    const blob = await response.blob();

    return new Promise<DataUrl>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = (): void => resolve(reader.result as DataUrl);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  throw new Error("File loading not supported in this environment");
}

/**
 * Validate that a string is a valid data URL
 */
export function isDataUrl(str: string): str is DataUrl {
  return str.startsWith("data:");
}

import type { DataUrl } from "@/lib/types/primitives";

/**
 * Load an image URI as a data URL (web implementation)
 */
export async function loadImageAsDataUrl(uri: string): Promise<DataUrl> {
  const response = await fetch(uri);
  const blob = await response.blob();
  
  return new Promise<DataUrl>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = (): void => resolve(reader.result as DataUrl);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}


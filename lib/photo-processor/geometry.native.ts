import { dewarpImage } from "page-dewarper";
import { loadImageAsDataUrl } from "./utils/loadImageAsDataUrl";
import type { NativeGeometryResult } from "./geometry";

// Config params are not forwarded; native pipeline uses its own DewarpConfig.
export async function processGeometryNative(
  photoUri: string,
  _config: Record<string, unknown>
): Promise<NativeGeometryResult> {
  try {
    const result = await dewarpImage(photoUri);
    const processedUri = await loadImageAsDataUrl(result.colorUri);
    return {
      success: true,
      processedUri,
      bwUri: result.bwUri,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Native dewarp failed",
    };
  }
}

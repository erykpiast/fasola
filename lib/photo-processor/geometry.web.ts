import type { DataUrl } from "@/lib/types/primitives";
import { processGeometry } from "./opencv-bridge";
import type { NativeGeometryResult } from "./geometry";

export async function processGeometryNative(
  photoUri: string,
  config: Record<string, unknown>
): Promise<NativeGeometryResult> {
  const result = await processGeometry(photoUri as DataUrl, config);
  return {
    success: result.success,
    processedUri: result.processedUri,
    bwUri: undefined,
    error: result.error,
  };
}

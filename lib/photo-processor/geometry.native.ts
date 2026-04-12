import { dewarpImage } from "page-dewarper";
import type { NativeGeometryResult } from "./geometry";

const DEWARP_TIMEOUT_MS = 120_000;

// Config params are not forwarded; native pipeline uses its own DewarpConfig.
export async function processGeometryNative(
  photoUri: string,
  _config: Record<string, unknown>
): Promise<NativeGeometryResult> {
  try {
    const dewarpPromise = dewarpImage(photoUri);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Native dewarp timed out after ${DEWARP_TIMEOUT_MS / 1000}s`)),
        DEWARP_TIMEOUT_MS
      )
    );

    const result = await Promise.race([dewarpPromise, timeoutPromise]);

    return {
      success: true,
      bwUri: result.bwUri,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Native dewarp failed",
    };
  }
}

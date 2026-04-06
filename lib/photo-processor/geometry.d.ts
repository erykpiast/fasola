import type { DataUrl } from "@/lib/types/primitives";

export interface NativeGeometryResult {
  success: boolean;
  processedUri?: DataUrl;
  bwUri?: string;
  error?: string;
}

export function processGeometryNative(
  photoUri: string,
  config: Record<string, unknown>
): Promise<NativeGeometryResult>;

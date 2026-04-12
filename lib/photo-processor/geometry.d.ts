export interface NativeGeometryResult {
  success: boolean;
  bwUri?: string;
  error?: string;
}

export function processGeometryNative(
  photoUri: string,
  config: Record<string, unknown>
): Promise<NativeGeometryResult>;

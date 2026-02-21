import { useMemo } from "react";

/**
 * Given source image dimensions and container dimensions,
 * returns the cover-rendered size (may be larger than container on one axis).
 * Returns undefined until source dimensions are known.
 */
export function useCoverSize(
  sourceSize: { width: number; height: number } | null,
  containerWidth: number,
  containerHeight: number,
): { width: number; height: number } | undefined {
  return useMemo(() => {
    if (!sourceSize) return undefined;
    const scale = Math.max(
      containerWidth / sourceSize.width,
      containerHeight / sourceSize.height,
    );
    return {
      width: Math.round(sourceSize.width * scale),
      height: Math.round(sourceSize.height * scale),
    };
  }, [sourceSize, containerWidth, containerHeight]);
}

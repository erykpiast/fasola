import type { ImageLoadEventData } from "expo-image";
import { useCallback, useState } from "react";
import { useCoverSize } from "./useCoverSize";

/**
 * Combines source dimension tracking from an expo-image onLoad event
 * with cover-size computation. Returns the cover-rendered dimensions
 * and a stable onLoad callback to wire into an Image component.
 */
export function useImageCoverSize(
  containerWidth: number,
  containerHeight: number,
): {
  coverSize: { width: number; height: number } | undefined;
  onImageLoad: (event: ImageLoadEventData) => void;
} {
  const [sourceSize, setSourceSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const onImageLoad = useCallback((event: ImageLoadEventData): void => {
    setSourceSize((prev) => {
      const next = { width: event.source.width, height: event.source.height };
      if (prev && prev.width === next.width && prev.height === next.height) {
        return prev;
      }
      return next;
    });
  }, []);

  const coverSize = useCoverSize(sourceSize, containerWidth, containerHeight);
  return { coverSize, onImageLoad };
}

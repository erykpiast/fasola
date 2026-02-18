import { Zoomable } from "@likashefqet/react-native-image-zoom";
import { type JSX, useCallback } from "react";
import { type ViewStyle } from "react-native";

export function ZoomableImage({
  children,
  style,
  onZoomChange,
  minScale = 1,
  maxScale = 5,
  doubleTapScale = 3,
}: {
  children: JSX.Element;
  style?: ViewStyle;
  onZoomChange?: (isZoomed: boolean) => void;
  minScale?: number;
  maxScale?: number;
  doubleTapScale?: number;
}): JSX.Element {
  const handleInteractionStart = useCallback((): void => {
    onZoomChange?.(true);
  }, [onZoomChange]);

  const handleResetAnimationEnd = useCallback((): void => {
    onZoomChange?.(false);
  }, [onZoomChange]);

  return (
    <Zoomable
      minScale={minScale}
      maxScale={maxScale}
      doubleTapScale={doubleTapScale}
      isDoubleTapEnabled
      isPanEnabled
      isPinchEnabled
      onInteractionStart={handleInteractionStart}
      onResetAnimationEnd={handleResetAnimationEnd}
      style={style}
    >
      {children}
    </Zoomable>
  );
}

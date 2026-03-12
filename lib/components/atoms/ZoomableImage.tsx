import { type JSX, useCallback, useRef } from "react";
import { type ViewStyle } from "react-native";
import {
  ResumableZoom,
  type ResumableZoomRefType,
  type SwipeDirection,
} from "react-native-zoom-toolkit";

export function ZoomableImage({
  children,
  style,
  onZoomChange,
  onSwipe,
  minScale = 1,
  maxScale = 5,
  panMode = "friction",
}: {
  children: JSX.Element;
  style?: ViewStyle;
  onZoomChange?: (isZoomed: boolean) => void;
  onSwipe?: (direction: SwipeDirection) => void;
  minScale?: number;
  maxScale?: number;
  panMode?: "clamp" | "free" | "friction";
}): JSX.Element {
  const ref = useRef<ResumableZoomRefType>(null);

  const handlePinchStart = useCallback((): void => {
    onZoomChange?.(true);
  }, [onZoomChange]);

  const handlePanStart = useCallback((): void => {
    const state = ref.current?.getState();
    if (state && state.scale > minScale) {
      onZoomChange?.(true);
    }
  }, [onZoomChange, minScale]);

  const handleGestureEnd = useCallback((): void => {
    const state = ref.current?.getState();
    if (!state) return;
    const atRest = Math.abs(state.scale - minScale) < 0.01;
    onZoomChange?.(!atRest);
  }, [onZoomChange, minScale]);

  return (
    <ResumableZoom
      ref={ref}
      minScale={minScale}
      maxScale={maxScale}
      panEnabled={true}
      panMode={panMode}
      style={{ ...style, overflow: "hidden" }}
      onPinchStart={handlePinchStart}
      onPanStart={handlePanStart}
      onGestureEnd={handleGestureEnd}
      onSwipe={onSwipe}
    >
      {children}
    </ResumableZoom>
  );
}

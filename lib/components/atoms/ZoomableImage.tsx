import { type JSX, useCallback, useRef, useState } from "react";
import { type ViewStyle } from "react-native";
import {
  ResumableZoom,
  type ResumableZoomRefType,
} from "react-native-zoom-toolkit";

export function ZoomableImage({
  children,
  style,
  onZoomChange,
  minScale = 1,
  maxScale = 5,
}: {
  children: JSX.Element;
  style?: ViewStyle;
  onZoomChange?: (isZoomed: boolean) => void;
  minScale?: number;
  maxScale?: number;
}): JSX.Element {
  const ref = useRef<ResumableZoomRefType>(null);
  const [panEnabled, setPanEnabled] = useState(false);

  const handlePinchStart = useCallback((): void => {
    setPanEnabled(true);
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
    if (atRest) {
      setPanEnabled(false);
    }
    onZoomChange?.(!atRest);
  }, [onZoomChange, minScale]);

  return (
    <ResumableZoom
      ref={ref}
      minScale={minScale}
      maxScale={maxScale}
      panEnabled={panEnabled}
      style={{ ...style, overflow: "hidden" }}
      onPinchStart={handlePinchStart}
      onPanStart={handlePanStart}
      onGestureEnd={handleGestureEnd}
    >
      {children}
    </ResumableZoom>
  );
}

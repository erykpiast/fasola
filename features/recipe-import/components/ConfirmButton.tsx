import { LiquidGlassButton } from "@/modules/liquid-glass";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type JSX,
} from "react";

const AUTO_CONFIRM_DELAY = 5000;

export interface ConfirmButtonRef {
  reset: () => void;
  stop: () => void;
}

export const ConfirmButton = forwardRef<
  ConfirmButtonRef,
  {
    onConfirm: () => void;
    disabled?: boolean;
  }
>(function ConfirmButton({ onConfirm, disabled = false }, ref): JSX.Element {
  const [fillProgress, setFillProgress] = useState(0);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const activeRef = useRef(false);
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const startFill = useCallback(() => {
    activeRef.current = true;
    startTimeRef.current = performance.now();
    const tick = (now: number) => {
      if (!activeRef.current) return;
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / AUTO_CONFIRM_DELAY, 1);
      console.log(progress);
      setFillProgress(progress);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        activeRef.current = false;
        if (!disabledRef.current) {
          onConfirmRef.current();
        }
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopFill = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setFillProgress(0);
  }, []);

  useEffect(() => {
    startFill();
    return () => {
      activeRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [startFill]);

  const reset = useCallback(() => {
    stopFill();
    startFill();
  }, [stopFill, startFill]);

  const stop = useCallback(() => {
    stopFill();
  }, [stopFill]);

  useImperativeHandle(ref, () => ({ reset, stop }), [reset, stop]);

  const handlePress = useCallback(() => {
    if (disabledRef.current) return;
    stopFill();
    onConfirmRef.current();
  }, [stopFill]);

  return (
    <LiquidGlassButton
      onPress={handlePress}
      systemImage="checkmark"
      size={48}
      fillProgress={fillProgress}
    />
  );
});

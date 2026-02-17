import { LiquidGlassButton } from "@/modules/liquid-glass";
import { useCallback, type JSX } from "react";

export function ConfirmButton({
  onConfirm,
  disabled = false,
}: {
  onConfirm: () => void;
  disabled?: boolean;
}): JSX.Element {
  const handlePress = useCallback(() => {
    if (disabled) return;
    onConfirm();
  }, [disabled, onConfirm]);

  return (
    <LiquidGlassButton
      onPress={handlePress}
      systemImage="checkmark"
      size={48}
    />
  );
}

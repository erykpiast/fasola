import { LiquidGlassButton } from "@/modules/liquid-glass";
import { useCallback, type JSX } from "react";

export function ConfirmButton({
  onConfirm,
  disabled = false,
  loading = false,
}: {
  onConfirm: () => void;
  disabled?: boolean;
  loading?: boolean;
}): JSX.Element {
  const handlePress = useCallback(() => {
    if (disabled || loading) return;
    onConfirm();
  }, [disabled, loading, onConfirm]);

  return (
    <LiquidGlassButton
      onPress={handlePress}
      systemImage="checkmark"
      size={48}
      loading={loading}
    />
  );
}

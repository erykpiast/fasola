import { LiquidGlassButton } from "liquid-glass";
import { type JSX } from "react";
import { usePhotoImport } from "../../photos/hooks/usePhotoImport";

export function AddRecipeButton(): JSX.Element {
  const { startImport } = usePhotoImport();

  return (
    <LiquidGlassButton onPress={startImport} systemImage="plus" size={48} />
  );
}

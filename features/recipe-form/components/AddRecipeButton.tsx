import { LiquidGlassButton } from "liquid-glass";
import { type JSX } from "react";

export function AddRecipeButton({
  onPress,
}: {
  onPress: () => void;
}): JSX.Element {
  return <LiquidGlassButton onPress={onPress} systemImage="plus" size={48} />;
}

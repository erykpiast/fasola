import type { ViewStyle } from "react-native";

export type LiquidGlassPopoverOption = {
  id: string;
  label: string;
  systemImage: string;
};

export type LiquidGlassPopoverProps = {
  visible: boolean;
  options: Array<LiquidGlassPopoverOption>;
  onSelect: (id: string) => void;
  onDismiss: () => void;
  buttonSize?: number;
  style?: ViewStyle;
};

import type { ViewStyle } from "react-native";

export type LiquidGlassSelectProps = {
  value: string;
  placeholder: string;
  onPress: () => void;
  systemImage?: string;
  disabled?: boolean;
  style?: ViewStyle;
};

import type { ViewStyle } from "react-native";

export type LiquidGlassButtonProps = {
  onPress: () => void;
  systemImage: string;
  size?: number;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "link";
};

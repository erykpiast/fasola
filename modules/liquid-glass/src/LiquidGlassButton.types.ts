import type { ViewStyle } from "react-native";

export type LiquidGlassButtonProps = {
  onPress: () => void;
  systemImage: string;
  size?: number;
  imageScale?: number;
  tintColor?: string;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "link";
};

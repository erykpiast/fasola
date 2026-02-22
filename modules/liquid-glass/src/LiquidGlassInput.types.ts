import type { ViewStyle } from "react-native";

export type LiquidGlassInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  label?: string;
  leadingSystemImage?: string;
  showClearButton?: boolean;
  onClear?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  variant?: "search" | "form";
  style?: ViewStyle;
  autoFocus?: boolean;
  returnKeyType?: "done" | "next" | "search";
  onSubmitEditing?: () => void;
  blurOnSubmit?: boolean;
  multiline?: boolean;
  maxLength?: number;
};

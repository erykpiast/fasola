import type { ViewStyle } from "react-native";
import type { TagId } from "@/lib/types/primitives";

export type LiquidGlassInputTag = {
  id: TagId;
  label: string;
  accessibilityLabel?: string;
};

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
  variant?: "text" | "tags" | "mixed";
  selectedTags?: Array<LiquidGlassInputTag>;
  onTagPress?: (id: TagId) => void;
  style?: ViewStyle;
  autoFocus?: boolean;
  returnKeyType?: "done" | "next" | "search";
  onSubmitEditing?: () => void;
  blurOnSubmit?: boolean;
  multiline?: boolean;
  maxLength?: number;
};

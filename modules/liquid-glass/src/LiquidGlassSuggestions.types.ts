import type { TagId } from "@/lib/types/primitives";
import type { ViewStyle } from "react-native";

export type LiquidGlassSuggestion = {
  id: TagId;
  label: string;
  countLabel: string;
  accessibilityLabel?: string;
};

export type LiquidGlassSuggestionsProps = {
  visible: boolean;
  suggestions: Array<LiquidGlassSuggestion>;
  onSuggestionPress: (id: TagId) => void;
  style?: ViewStyle;
};

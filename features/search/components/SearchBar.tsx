import { useTranslation } from "@/platform/i18n/useTranslation";
import { useSearchBarVisibilityTransition } from "@/features/search/hooks/useSearchBarVisibilityTransition";
import { LiquidGlassInput } from "liquid-glass";
import { type JSX } from "react";
import { StyleSheet } from "react-native";
import Animated from "react-native-reanimated";

export function SearchBar({
  value,
  onChangeText,
  onFocus,
  onBlur,
  isHidden,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  isHidden: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  const { containerStyle } = useSearchBarVisibilityTransition(isHidden);

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <LiquidGlassInput
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={t("search.placeholder")}
        leadingSystemImage="magnifyingglass"
        showClearButton
        onClear={() => onChangeText("")}
        variant="mixed"
        returnKeyType="search"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

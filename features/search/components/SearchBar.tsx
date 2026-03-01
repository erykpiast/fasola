import { useTranslation } from "@/platform/i18n/useTranslation";
import { LiquidGlassInput } from "liquid-glass";
import { type JSX } from "react";
import { StyleSheet, View } from "react-native";

export function SearchBar({
  value,
  onChangeText,
  onFocus,
  onBlur,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}): JSX.Element {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

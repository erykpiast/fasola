import { LiquidGlassButton } from "@/modules/liquid-glass";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { type JSX } from "react";
import { StyleSheet } from "react-native";

export function BackButton({ onPress }: { onPress: () => void }): JSX.Element {
  const { t } = useTranslation();

  return (
    <LiquidGlassButton
      onPress={onPress}
      systemImage="chevron.left"
      style={styles.button}
      accessibilityLabel={t("accessibility.back")}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    bottom: 28,
    left: 28,
    zIndex: 10,
  },
});

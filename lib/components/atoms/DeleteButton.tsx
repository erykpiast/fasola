import { LiquidGlassButton } from "@/modules/liquid-glass";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { type JSX } from "react";
import { StyleSheet } from "react-native";

export function DeleteButton({
  onPress,
}: {
  onPress: () => void;
}): JSX.Element {
  const { t } = useTranslation();

  return (
    <LiquidGlassButton
      onPress={onPress}
      systemImage="trash"
      imageScale={0.8}
      style={styles.button}
      tintColor="#FF3B30"
      accessibilityLabel={t("accessibility.delete")}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    bottom: 28,
    right: 88,
    zIndex: 10,
  },
});

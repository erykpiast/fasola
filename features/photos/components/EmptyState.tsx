import { useTranslation } from "@/platform/i18n/useTranslation";
import { getColors } from "@/platform/theme/glassStyles";
import { useTheme } from "@/platform/theme/useTheme";
import { LiquidGlassButton } from "liquid-glass";
import { type JSX, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

type EmptyStateProps = {
  onAddPress: () => void;
  hiding?: boolean;
};

export function EmptyState({ onAddPress, hiding }: EmptyStateProps): JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const colors = getColors(theme);

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(hiding ? 1 : 0, {
      damping: 40,
      stiffness: 200,
    });
  }, [hiding, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ scale: 1 - progress.value * 0.2 }],
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.innerContainer, animatedStyle]}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t("emptyState.title")}
        </Text>
        <View>
          <LiquidGlassButton
            onPress={onAddPress}
            systemImage="plus"
            size={72}
            accessibilityLabel={t("addRecipe.button")}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  innerContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "400",
    marginBottom: 24,
  },
});

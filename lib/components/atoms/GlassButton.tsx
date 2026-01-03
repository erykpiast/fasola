import { getColors } from "@/platform/theme/glassStyles";
import { useTheme } from "@/platform/theme/useTheme";
import { GlassView } from "expo-glass-effect";
import { type JSX } from "react";
import { Pressable, StyleSheet, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

const SPRING_CONFIG = {
  damping: 15,
  stiffness: 150,
  mass: 0.5,
};

export function GlassButton({
  onPress,
  children,
  size = 48,
  style,
  accessibilityLabel,
  accessibilityRole = "button",
  disabled = false,
}: {
  onPress: () => void;
  children: React.ReactNode;
  size?: number;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "link";
  disabled?: boolean;
}): JSX.Element {
  const theme = useTheme();
  const colors = getColors(theme);
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: withSpring(1 + pressed.value * 0.3, SPRING_CONFIG) },
      ],
    };
  });

  const overlayStyle = useAnimatedStyle(() => {
    return {
      opacity: withSpring(pressed.value, SPRING_CONFIG),
    };
  });

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        pressed.value = 1;
      }}
      onPressOut={() => {
        pressed.value = 0;
      }}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      style={style}
    >
      <Animated.View style={animatedStyle}>
        <GlassView
          style={[
            styles.container,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
            },
          ]}
        >
          {children}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: colors.glassPressedOverlay,
                borderRadius: size / 2,
              },
              overlayStyle,
            ]}
            pointerEvents="none"
          />
        </GlassView>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
});

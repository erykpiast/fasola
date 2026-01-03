import {
  GLASS_BORDER_RADIUS,
  GLASS_SPRING_CONFIG,
  getColors,
} from "@/platform/theme/glassStyles";
import { useTheme } from "@/platform/theme/useTheme";
import { GlassView } from "expo-glass-effect";
import { type JSX } from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

export function GlassContainer({
  children,
  style,
  height,
  borderRadius = GLASS_BORDER_RADIUS,
  scaleIntensity = 0.02,
  onTouchStart,
  onTouchEnd,
  onTouchCancel,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  height?: number;
  borderRadius?: number;
  scaleIntensity?: number;
  onTouchStart?: () => void;
  onTouchEnd?: () => void;
  onTouchCancel?: () => void;
}): JSX.Element {
  const theme = useTheme();
  const colors = getColors(theme);
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withSpring(
            1 + pressed.value * scaleIntensity,
            GLASS_SPRING_CONFIG
          ),
        },
      ],
    };
  });

  const overlayStyle = useAnimatedStyle(() => {
    return {
      opacity: withSpring(pressed.value, GLASS_SPRING_CONFIG),
    };
  });

  return (
    <Animated.View
      style={[style, animatedStyle]}
      onTouchStart={() => {
        pressed.value = 1;
        onTouchStart?.();
      }}
      onTouchEnd={() => {
        pressed.value = 0;
        onTouchEnd?.();
      }}
      onTouchCancel={() => {
        pressed.value = 0;
        onTouchCancel?.();
      }}
    >
      <GlassView
        style={[
          styles.glassView,
          {
            borderRadius,
            height,
          },
        ]}
      >
        {children}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: colors.glassPressedOverlay,
              borderRadius,
            },
            overlayStyle,
          ]}
          pointerEvents="none"
        />
      </GlassView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glassView: {
    overflow: "hidden",
  },
});

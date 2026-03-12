import type { DimensionValue, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { type JSX, useEffect } from "react";

export function SkeletonBlock({
  width,
  height,
  style,
}: {
  width: DimensionValue;
  height: number;
  style?: ViewStyle;
}): JSX.Element {
  const opacity = useSharedValue(0.15);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 1000 }),
        withTiming(0.15, { duration: 1000 })
      ),
      -1
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          backgroundColor: "rgba(255,255,255,0.3)",
          borderRadius: 4,
        },
        style,
        animatedStyle,
      ]}
    />
  );
}

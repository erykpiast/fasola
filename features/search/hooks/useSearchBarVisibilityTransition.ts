import { useEffect, useMemo } from "react";
import { Keyboard, type ViewStyle } from "react-native";
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

export function useSearchBarVisibilityTransition(
  shouldHide: boolean,
): {
  containerStyle: ViewStyle;
} {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(shouldHide ? 1 : 0, {
      damping: 40,
      stiffness: 200,
    });
  }, [progress, shouldHide]);

  useEffect(() => {
    if (shouldHide) {
      Keyboard.dismiss();
    }
  }, [shouldHide]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: -progress.value * 40 },
      { scale: 1 - progress.value * 0.05 },
    ],
  }));

  return useMemo(
    () => ({
      containerStyle,
    }),
    [containerStyle],
  );
}

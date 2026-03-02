import { useEffect } from "react";
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

export function usePopoverTransition(
  shouldHideButton: boolean,
): {
  buttonStyle: ReturnType<typeof useAnimatedStyle>;
} {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(shouldHideButton ? 1 : 0, {
      damping: 40,
      stiffness: 200,
    });
  }, [shouldHideButton, progress]);

  const buttonStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
  }));

  return { buttonStyle };
}

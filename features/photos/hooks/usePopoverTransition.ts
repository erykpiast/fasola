import { useEffect } from "react";
import { Keyboard } from "react-native";
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

export function usePopoverTransition(
  popoverVisible: boolean,
  isImporting: boolean,
) {
  const progress = useSharedValue(0);
  const shouldHideUI = popoverVisible || isImporting;

  useEffect(() => {
    progress.value = withSpring(shouldHideUI ? 1 : 0, {
      damping: 40,
      stiffness: 200,
    });
  }, [shouldHideUI, progress]);

  useEffect(() => {
    if (popoverVisible) {
      Keyboard.dismiss();
    }
  }, [popoverVisible]);

  const searchBarStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: -progress.value * 40 },
      { scale: 1 - progress.value * 0.05 },
    ],
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
  }));

  return { searchBarStyle, buttonStyle };
}

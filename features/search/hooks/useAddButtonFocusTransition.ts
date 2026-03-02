import { useEffect, useMemo } from "react";
import {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const ADD_BUTTON_SIZE = 48;
const ADD_BUTTON_GAP = 12;
const HIDE_COLLAPSE_DURATION_MS = 250;
const SHOW_COLLAPSE_DURATION_MS = 500;
const COLLAPSE_DELAY_MS = 250;
const HIDE_VISUAL_SPRING_CONFIG = {
  damping: 28,
  stiffness: 220,
  mass: 0.55,
  overshootClamping: true,
} as const;
const SHOW_VISUAL_SPRING_CONFIG = {
  damping: 22,
  stiffness: 220,
  mass: 0.9,
  overshootClamping: true,
} as const;

export function useAddButtonFocusTransition(isSearchFocused: boolean): {
  addButtonOuterStyle: ReturnType<typeof useAnimatedStyle>;
  addButtonInnerStyle: ReturnType<typeof useAnimatedStyle>;
} {
  const visualProgress = useSharedValue(0);
  const collapseProgress = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(visualProgress);
    cancelAnimation(collapseProgress);

    if (isSearchFocused) {
      visualProgress.value = withSpring(1, HIDE_VISUAL_SPRING_CONFIG);
      collapseProgress.value = withDelay(
        0,
        withTiming(1, {
          duration: HIDE_COLLAPSE_DURATION_MS,
        }),
      );

      return;
    }

    collapseProgress.value = withTiming(
      0,
      {
        duration: SHOW_COLLAPSE_DURATION_MS,
      },
      (isFinished) => {
        if (!isFinished) {
          return;
        }

        visualProgress.value = withSpring(0, SHOW_VISUAL_SPRING_CONFIG);
      },
    );
  }, [collapseProgress, isSearchFocused, visualProgress]);

  const addButtonOuterStyle = useAnimatedStyle(() => ({
    width: ADD_BUTTON_SIZE * (1 - collapseProgress.value),
    marginLeft: ADD_BUTTON_GAP * (1 - collapseProgress.value),
  }));

  const addButtonInnerStyle = useAnimatedStyle(() => ({
    opacity: 1 - visualProgress.value,
    transform: [{ scale: 1 - visualProgress.value * 0.35 }],
  }));

  return useMemo(
    () => ({
      addButtonOuterStyle,
      addButtonInnerStyle,
    }),
    [addButtonInnerStyle, addButtonOuterStyle],
  );
}

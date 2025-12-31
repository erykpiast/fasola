import { getColors } from "@/platform/theme/glassStyles";
import { useTheme } from "@/platform/theme/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { GlassView } from "expo-glass-effect";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type JSX,
} from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";

const ANIMATION_DURATION = 5000;

export interface ConfirmButtonRef {
  reset: () => void;
  stop: () => void;
}

export const ConfirmButton = forwardRef<
  ConfirmButtonRef,
  {
    onConfirm: () => void;
    disabled?: boolean;
  }
>(function ConfirmButton({ onConfirm, disabled = false }, ref): JSX.Element {
  const theme = useTheme();
  const colors = getColors(theme);
  const animatedValue = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const disabledRef = useRef(disabled);
  const onConfirmRef = useRef(onConfirm);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    onConfirmRef.current = onConfirm;
  }, [onConfirm]);

  const startAnimation = useCallback(() => {
    setIsAnimating(true);
    animatedValue.setValue(0);

    Animated.timing(animatedValue, {
      toValue: 1,
      duration: ANIMATION_DURATION,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !disabledRef.current) {
        onConfirmRef.current();
      }
    });
  }, [animatedValue]);

  const stopAnimation = useCallback(() => {
    animatedValue.stopAnimation();
    animatedValue.setValue(0);
    setIsAnimating(false);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [animatedValue]);

  const resetAnimation = useCallback(() => {
    stopAnimation();

    timerRef.current = setTimeout(() => {
      startAnimation();
    }, 0);
  }, [startAnimation, stopAnimation]);

  useImperativeHandle(
    ref,
    () => ({
      reset: resetAnimation,
      stop: stopAnimation,
    }),
    [resetAnimation, stopAnimation]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      animatedValue.stopAnimation();
    };
  }, [animatedValue]);

  const handlePress = useCallback(() => {
    if (disabled) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    animatedValue.stopAnimation();
    onConfirmRef.current();
  }, [disabled, animatedValue]);

  const fillWidth = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const iconClipWidth = animatedValue.interpolate({
    inputRange: [0, 10 / 48, 38 / 48, 1],
    outputRange: [0, 0, 28, 28],
  });

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
    >
      <GlassView style={styles.container}>
        <View style={styles.buttonContent}>
          {isAnimating && (
            <Animated.View
              style={[
                styles.fillAnimation,
                {
                  width: fillWidth,
                  backgroundColor: colors.text,
                },
              ]}
            />
          )}
          <View style={styles.iconWrapper}>
            <Ionicons name="checkmark" size={28} color={colors.text} />
            {isAnimating && (
              <Animated.View
                style={[styles.iconClipContainer, { width: iconClipWidth }]}
              >
                <View style={styles.contrastIconInner}>
                  <Ionicons
                    name="checkmark"
                    size={28}
                    color={colors.background}
                  />
                </View>
              </Animated.View>
            )}
          </View>
        </View>
      </GlassView>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: "hidden",
  },
  buttonContent: {
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  fillAnimation: {
    position: "absolute",
    left: 0,
    top: 0,
    height: 48,
  },
  iconWrapper: {
    width: 28,
    height: 28,
    position: "relative",
    zIndex: 1,
  },
  iconClipContainer: {
    position: "absolute",
    left: 0,
    top: 0,
    height: 28,
    overflow: "hidden",
  },
  contrastIconInner: {
    width: 28,
    height: 28,
  },
});

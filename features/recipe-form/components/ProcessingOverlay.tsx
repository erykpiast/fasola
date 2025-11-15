import { LinearGradient } from "expo-linear-gradient";
import { type JSX, useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

export function ProcessingOverlay(): JSX.Element {
  const { width: screenWidth } = useWindowDimensions();
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const moveAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(translateX, {
          toValue: 1,
          duration: 3000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );

    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    moveAnimation.start();
    pulseAnimation.start();

    return () => {
      moveAnimation.stop();
      pulseAnimation.stop();
    };
  }, [translateX, opacity]);

  const gradientColors = [
    "transparent",
    "transparent",
    "rgba(255, 255, 255, 0.35)",
    "transparent",
    "transparent",
  ] as const;

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.gradientContainer,
          {
            width: screenWidth * 2.2,
            opacity,
            transform: [
              {
                translateX: translateX.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-screenWidth * 1.6, screenWidth * 1.6],
                }),
              },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradient}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  gradientContainer: {
    position: "absolute",
    top: 0,
    bottom: 0,
  },
  gradient: {
    flex: 1,
  },
});

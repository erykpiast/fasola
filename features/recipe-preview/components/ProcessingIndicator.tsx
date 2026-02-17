import { useTranslation } from "@/platform/i18n/useTranslation";
import { type JSX, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, StyleSheet, View } from "react-native";

const ROTATING_KEYS = [
  "m1",
  "m2",
  "m3",
  "m4",
  "m5",
  "m6",
  "m7",
  "m8",
  "m9",
  "m10",
] as const;

const INTERVAL_MS = 3000;
const FADE_DURATION_MS = 500;

function shuffle<T>(array: Array<T>): Array<T> {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function ProcessingIndicator(): JSX.Element {
  const { t } = useTranslation();
  const shuffled = useMemo(() => shuffle([...ROTATING_KEYS]), []);
  const [index, setIndex] = useState(-1); // -1 = first message
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_DURATION_MS,
        useNativeDriver: true,
      }).start(() => {
        setIndex((prev) => {
          const next = prev + 1;
          return next >= shuffled.length ? 0 : next;
        });
        Animated.timing(opacity, {
          toValue: 1,
          duration: FADE_DURATION_MS,
          useNativeDriver: true,
        }).start();
      });
    }, INTERVAL_MS);

    return () => clearInterval(interval);
  }, [opacity, shuffled.length]);

  const key = index < 0 ? "first" : shuffled[index];
  const message = t(`processing.messages.${key}`);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="white" />
      <Animated.Text style={[styles.text, { opacity }]}>{message}</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  text: {
    color: "white",
    fontSize: 16,
    textAlign: "center",
    paddingHorizontal: 32,
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

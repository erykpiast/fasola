import {
  type ImageContentFit,
  type ImageLoadEventData,
  Image,
} from "expo-image";
import { type JSX, useCallback, useEffect } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { ImageUri } from "@/lib/types/primitives";

const AnimatedExpoImage = Animated.createAnimatedComponent(Image);

const BLUR_RADIUS = 4;
const FADE_DURATION_MS = 500;

export function ProgressiveImage({
  uri,
  thumbnailUri,
  style,
  contentFit = "cover",
  onLoad,
}: {
  uri: ImageUri;
  thumbnailUri: ImageUri | undefined;
  style?: ViewStyle;
  contentFit?: ImageContentFit;
  onLoad?: (event: ImageLoadEventData) => void;
}): JSX.Element {
  const thumbnailOpacity = useSharedValue(thumbnailUri ? 1 : 0);

  useEffect(() => {
    if (thumbnailUri) {
      thumbnailOpacity.value = 1;
    }
  }, [thumbnailUri, thumbnailOpacity]);

  const handleFullImageLoad = useCallback(
    (event: ImageLoadEventData): void => {
      thumbnailOpacity.value = withTiming(0, { duration: FADE_DURATION_MS });
      onLoad?.(event);
    },
    [thumbnailOpacity, onLoad],
  );

  const thumbnailStyle = useAnimatedStyle(() => ({
    opacity: thumbnailOpacity.value,
  }));

  return (
    <View style={[styles.container, style]}>
      <Image
        source={{ uri }}
        style={styles.image}
        contentFit={contentFit}
        onLoad={handleFullImageLoad}
      />
      {thumbnailUri && (
        <AnimatedExpoImage
          source={{ uri: thumbnailUri }}
          style={[styles.image, styles.thumbnailOverlay, thumbnailStyle]}
          contentFit={contentFit}
          blurRadius={BLUR_RADIUS}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  thumbnailOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
});

import { Image } from "expo-image";
import { type JSX } from "react";
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import type { ImageUri } from "@/lib/types/primitives";

export function RecipeImageDisplay({
  uri,
  style,
}: {
  uri: ImageUri;
  style?: ViewStyle;
}): JSX.Element {
  const { width } = useWindowDimensions();

  return (
    <View style={[styles.container, { width, height: width }, style]}>
      <Image source={{ uri }} style={styles.image} contentFit="cover" />
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
});

import { useSourceName } from "@/features/sources/hooks/useSourceName";
import { MaterialIcons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { type JSX } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const getHostname = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
};

export function SourceDisplay({
  source,
  style,
}: {
  source?: string;
  style?: object;
}): JSX.Element | null {
  const { displayName, isUrl: isUrlSource } = useSourceName(source);

  if (!displayName) {
    return null;
  }

  const handlePress = async () => {
    if (isUrlSource && source) {
      await WebBrowser.openBrowserAsync(source);
    }
  };

  const displayText = isUrlSource ? getHostname(displayName) : displayName;

  const content = (
    <View style={[styles.container, style]}>
      <MaterialIcons
        name={isUrlSource ? "language" : "menu-book"}
        size={20}
        color="#666"
        style={styles.icon}
      />
      <Text style={styles.text} numberOfLines={1} ellipsizeMode="tail">
        {displayText}
      </Text>
    </View>
  );

  if (isUrlSource) {
    return (
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => pressed && styles.pressed}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    marginRight: 8,
  },
  text: {
    fontSize: 16,
    color: "#666",
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});

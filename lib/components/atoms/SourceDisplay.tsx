import { MaterialIcons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { type JSX } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const isUrl = (str: string): boolean => {
  if (typeof str !== "string") {
    return false;
  }
  return str.startsWith("http://") || str.startsWith("https://");
};

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
  if (!source) {
    return null;
  }

  const handlePress = async () => {
    if (isUrl(source)) {
      await WebBrowser.openBrowserAsync(source);
    }
  };

  const isUrlSource = isUrl(source);
  const displayText = isUrlSource ? getHostname(source) : source;

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

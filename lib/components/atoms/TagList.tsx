import { Fragment, type JSX } from "react";
import { View, Text, StyleSheet } from "react-native";

export function TagList({ tags, style }: {
  tags: string[];
  style?: object;
}): JSX.Element | null {
  if (!tags || tags.length === 0) {
    return null;
  }

  return (
    <View style={[styles.container, style]}>
      {tags.map((tag, index) => (
        <Fragment key={`${tag}-${index}`}>
          <Text style={styles.tag}>{tag}</Text>
          {index < tags.length - 1 && <Text style={styles.separator}> </Text>}
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  tag: {
    fontSize: 16,
    color: "#666",
  },
  separator: {
    fontSize: 16,
    color: "#666",
  },
});

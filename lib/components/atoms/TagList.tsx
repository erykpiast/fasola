import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface TagListProps {
  tags: string[];
  style?: object;
}

export const TagList: React.FC<TagListProps> = ({ tags, style }) => {
  if (!tags || tags.length === 0) {
    return null;
  }

  return (
    <View style={[styles.container, style]}>
      {tags.map((tag, index) => (
        <React.Fragment key={`${tag}-${index}`}>
          <Text style={styles.tag}>{tag}</Text>
          {index < tags.length - 1 && <Text style={styles.separator}> </Text>}
        </React.Fragment>
      ))}
    </View>
  );
};

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

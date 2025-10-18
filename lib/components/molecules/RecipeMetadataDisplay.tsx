import React from "react";
import { View, StyleSheet } from "react-native";
import type { RecipeMetadata } from "@lib/types/recipe";
import { TagList } from "@lib/components/atoms/TagList";
import { SourceDisplay } from "@lib/components/atoms/SourceDisplay";

interface RecipeMetadataDisplayProps {
  metadata: RecipeMetadata;
  style?: object;
}

export const RecipeMetadataDisplay: React.FC<RecipeMetadataDisplayProps> = ({
  metadata,
  style,
}) => {
  const hasTags = metadata.tags && metadata.tags.length > 0;
  const hasSource = !!metadata.source;

  if (!hasTags && !hasSource) {
    return null;
  }

  return (
    <View style={[styles.container, style]}>
      {hasTags && <TagList tags={metadata.tags} style={styles.tags} />}
      {hasSource && <SourceDisplay source={metadata.source} style={styles.source} />}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  tags: {
    marginBottom: 12,
  },
  source: {
    marginTop: 0,
  },
});

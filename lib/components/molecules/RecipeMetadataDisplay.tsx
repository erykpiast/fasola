import { type JSX } from "react";
import { View, StyleSheet } from "react-native";
import type { RecipeMetadata } from "@/lib/types/recipe";
import { TagList } from "@/lib/components/atoms/TagList";
import { SourceDisplay } from "@/lib/components/atoms/SourceDisplay";

export function RecipeMetadataDisplay({
  metadata,
  style,
}: {
  metadata: RecipeMetadata;
  style?: object;
}): JSX.Element | null {
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
}

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

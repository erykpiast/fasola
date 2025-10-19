import { SourceDisplay } from "@/lib/components/atoms/SourceDisplay";
import { TagList } from "@/lib/components/atoms/TagList";
import type { RecipeMetadata } from "@/lib/types/recipe";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { type JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

export function RecipeMetadataDisplay({
  metadata,
  style,
}: {
  metadata: RecipeMetadata;
  style?: object;
}): JSX.Element | null {
  const { t } = useTranslation();
  const hasTags = metadata.tags && metadata.tags.length > 0;
  const hasSource = !!metadata.source;

  if (!hasTags && !hasSource) {
    return (
      <View style={[styles.container, style]}>
        <Text style={styles.emptyState}>{t("recipeMetadata.emptyState")}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {hasTags && <TagList tags={metadata.tags} style={styles.tags} />}
      {hasSource && (
        <SourceDisplay source={metadata.source} style={styles.source} />
      )}
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
  emptyState: {
    fontSize: 14,
    color: "#888888",
    fontStyle: "italic",
  },
});

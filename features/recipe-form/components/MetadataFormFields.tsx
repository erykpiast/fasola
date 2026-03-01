import { SourceSelector } from "@/features/source-selector";
import type { RecipeMetadataWrite } from "@/lib/repositories/types";
import { LiquidGlassInput } from "@/modules/liquid-glass";
import { GlassLikeTagInput } from "@/lib/components/atoms/GlassLikeTagInput";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { getGlassInputColors } from "@/platform/theme/glassStyles";
import { type Theme, useTheme } from "@/platform/theme/useTheme";
import { type JSX, useCallback, useRef } from "react";
import {
  type NativeMethods,
  Platform,
  type ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";

function scrollToElement(element: ScrollView, y: number, height: number) {
  element.scrollTo({
    y: y - height - 40,
    animated: true,
  });
}
export function MetadataFormFields({
  value,
  onChange,
  style,
  scrollViewRef,
}: {
  value: RecipeMetadataWrite;
  onChange: (metadata: Partial<RecipeMetadataWrite>) => void;
  style?: ViewStyle;
  scrollViewRef: React.RefObject<ScrollView | null>;
}): JSX.Element {
  const { t } = useTranslation();
  const tagsRef = useRef<TextInput>(null);
  const titleContainerRef = useRef<View>(null);
  const tagsContainerRef = useRef<View>(null);

  const theme = useTheme();

  const scrollToInput = useCallback(
    (containerRef: React.RefObject<View | null>) => {
      if (!scrollViewRef.current || !containerRef.current) {
        return;
      }

      if (Platform.OS === "web") {
        containerRef.current.measure((_x, y, _width, height) => {
          scrollToElement(scrollViewRef.current!, y, height);
        });

        return;
      }

      setTimeout(() => {
        const container = containerRef.current;
        const scrollView = scrollViewRef.current;

        if (!container || !scrollView) {
          return;
        }

        const nativeScrollRef = scrollView.getNativeScrollRef();
        if (!nativeScrollRef) {
          return;
        }

        container.measureLayout(
          nativeScrollRef as unknown as NativeMethods,
          (_x, y, _width, height) => {
            scrollToElement(scrollView, y, height);
          },
          () => {}
        );
      }, 100);
    },
    [scrollViewRef]
  );

  return (
    <View style={[styles.container, style]}>
      <View ref={titleContainerRef}>
        <LiquidGlassInput
          label={t("recipeForm.title.label")}
          value={value.title ?? ""}
          onChangeText={(text) => onChange({ title: text || undefined })}
          placeholder={t("recipeForm.title.placeholder")}
          variant="text"
          returnKeyType="next"
          onSubmitEditing={() => tagsRef.current?.focus()}
          blurOnSubmit={true}
          onFocus={() => scrollToInput(titleContainerRef)}
        />
      </View>

      <View style={styles.sourceContainer}>
        <Text style={[styles.label, getLabelColor(theme)]}>
          {t("recipeForm.source.label")}
        </Text>
        <SourceSelector
          value={value.source ?? ""}
          onValueChange={(source) => onChange({ source: source || undefined })}
        />
      </View>

      <View ref={tagsContainerRef}>
        <GlassLikeTagInput
          ref={tagsRef}
          tags={value.tags ?? []}
          onChange={(tags) => onChange({ tags: tags as Array<`#${string}`> })}
          onFocus={() => scrollToInput(tagsContainerRef)}
          label={t("recipeForm.tags.label")}
          placeholder={t("recipeForm.tags.placeholder")}
        />
      </View>
    </View>
  );
}

function getLabelColor(theme: Theme) {
  return getGlassInputColors(theme).label;
}

const styles = StyleSheet.create({
  container: {
    gap: 24,
  },
  sourceContainer: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: "500",
  },
});

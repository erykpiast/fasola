import { FormInput } from "@/lib/components/atoms/FormInput";
import { TagInput } from "@/lib/components/atoms/TagInput";
import type { RecipeMetadata } from "@/lib/types/recipe";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { type JSX, useCallback, useRef } from "react";
import {
  Platform,
  type ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ViewStyle,
  findNodeHandle,
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
  value: RecipeMetadata;
  onChange: (metadata: Partial<RecipeMetadata>) => void;
  style?: ViewStyle;
  scrollViewRef: React.RefObject<ScrollView | null>;
}): JSX.Element {
  const { t } = useTranslation();
  const titleRef = useRef<TextInput>(null);
  const sourceRef = useRef<TextInput>(null);
  const tagsRef = useRef<TextInput>(null);
  const titleContainerRef = useRef<View>(null);
  const sourceContainerRef = useRef<View>(null);
  const tagsContainerRef = useRef<View>(null);

  const scrollToInput = useCallback(
    (containerRef: React.RefObject<View | null>) => {
      if (scrollViewRef.current || !containerRef.current) {
        return;
      }

      if (Platform.OS === "web") {
        containerRef.current.measure((x, y, width, height) => {
          scrollToElement(scrollViewRef.current!, y, height);
        });

        return;
      }

      setTimeout(() => {
        if (!containerRef.current || !scrollViewRef.current) {
          return;
        }

        const nodeHandle = findNodeHandle(scrollViewRef.current);

        if (nodeHandle === null) {
          return;
        }

        containerRef.current.measureLayout(
          nodeHandle,
          (_x, y, _width, height) => {
            scrollToElement(scrollViewRef.current!, y, height);
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
        <FormInput
          ref={titleRef}
          label={t("recipeForm.title.label")}
          value={value.title ?? ""}
          onChangeText={(text) => onChange({ title: text || undefined })}
          placeholder={t("recipeForm.title.placeholder")}
          returnKeyType="next"
          onSubmitEditing={() => sourceRef.current?.focus()}
          blurOnSubmit={true}
          onFocus={() => scrollToInput(titleContainerRef)}
        />
      </View>

      <View ref={sourceContainerRef}>
        <FormInput
          ref={sourceRef}
          label={t("recipeForm.source.label")}
          value={value.source ?? ""}
          onChangeText={(text) => onChange({ source: text || undefined })}
          placeholder={t("recipeForm.source.placeholder")}
          returnKeyType="next"
          onSubmitEditing={() => tagsRef.current?.focus()}
          blurOnSubmit={true}
          onFocus={() => scrollToInput(sourceContainerRef)}
        />
      </View>

      <View ref={tagsContainerRef}>
        <TagInput
          ref={tagsRef}
          tags={value.tags}
          onChange={(tags) => onChange({ tags: tags as Array<`#${string}`> })}
          onFocus={() => scrollToInput(tagsContainerRef)}
          label={t("recipeForm.tags.label")}
          placeholder={t("recipeForm.tags.placeholder")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 24,
  },
});

import type { RecipeMetadata } from "@/lib/types/recipe";
import { parseTags, validateTags } from "@/lib/utils/recipeValidation";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { useCallback, useMemo, useState } from "react";

const emptyMetadata: RecipeMetadata = {
  title: undefined,
  source: undefined,
  tags: [],
};

export function useRecipeForm(config: {
  initialValues?: RecipeMetadata;
  onSubmit: (metadata: RecipeMetadata) => void;
}): {
  values: RecipeMetadata;
  errors: Record<string, string>;
  handleChange: (updates: Partial<RecipeMetadata>) => void;
  handleSubmit: () => void;
  isDirty: boolean;
} {
  const { t } = useTranslation();
  const initialValues = config.initialValues ?? emptyMetadata;

  const [values, setValues] = useState<RecipeMetadata>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);

  const handleChange = useCallback((updates: Partial<RecipeMetadata>) => {
    setValues((prev) => ({ ...prev, ...updates }));
    setIsDirty(true);
    // Clear errors for updated fields
    setErrors((prev) => {
      const next = { ...prev };
      Object.keys(updates).forEach((key) => {
        delete next[key];
      });
      return next;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    const newErrors: Record<string, string> = {};

    // Trim string fields before validation
    const trimmedValues: RecipeMetadata = {
      title: values.title?.trim() || undefined,
      source: values.source?.trim() || undefined,
      tags: values.tags,
    };

    // Validate tags
    if (trimmedValues.tags.length > 0 && !validateTags(trimmedValues.tags)) {
      newErrors.tags = t("errors.invalidTags");
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Submit validated and trimmed metadata
    config.onSubmit(trimmedValues);
  }, [values, config, t]);

  return {
    values,
    errors,
    handleChange,
    handleSubmit,
    isDirty,
  };
}

/**
 * Helper hook for tag input field
 * Handles parsing comma/space separated input into tags array
 */
export function useTagInput(
  tags: Array<`#${string}`>,
  onChange: (tags: Array<`#${string}`>) => void
) {
  const [inputValue, setInputValue] = useState("");

  const handleInputChange = useCallback((text: string) => {
    setInputValue(text);
  }, []);

  const handleInputBlur = useCallback(() => {
    if (!inputValue.trim()) return;

    const parsed = parseTags(inputValue);
    if (parsed.length > 0) {
      onChange([...tags, ...parsed]);
      setInputValue("");
    }
  }, [inputValue, tags, onChange]);

  const handleRemoveTag = useCallback(
    (index: number) => {
      onChange(tags.filter((_, i) => i !== index));
    },
    [tags, onChange]
  );

  return useMemo(
    () => ({
      inputValue,
      handleInputChange,
      handleInputBlur,
      handleRemoveTag,
    }),
    [inputValue, handleInputChange, handleInputBlur, handleRemoveTag]
  );
}

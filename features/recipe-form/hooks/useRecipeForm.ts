import type { RecipeMetadataWrite } from "@/lib/repositories/types";
import { parseTags, validateTags } from "@/lib/utils/recipeValidation";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { useCallback, useMemo, useReducer, useState } from "react";

const emptyMetadata: RecipeMetadataWrite = {
  title: undefined,
  source: undefined,
  tags: [],
  tagIds: [],
};

type FormState = {
  values: RecipeMetadataWrite;
  errors: Record<string, string>;
  isDirty: boolean;
};

type FormAction =
  | { type: "UPDATE_VALUES"; updates: Partial<RecipeMetadataWrite> }
  | { type: "SET_ERRORS"; errors: Record<string, string> }
  | {
      type: "UPDATE_FROM_EXTRACTION";
      title?: string;
      suggestedTags?: Array<`#${string}`>;
    };

function detectChanges(
  current: RecipeMetadataWrite,
  updates: Partial<RecipeMetadataWrite>
): boolean {
  return Object.entries(updates).some(([key, newValue]) => {
    const currentValue = current[key as keyof RecipeMetadataWrite];

    if (Array.isArray(newValue) && Array.isArray(currentValue)) {
      return (
        newValue.length !== currentValue.length ||
        newValue.some((item, index) => item !== currentValue[index])
      );
    }

    return newValue !== currentValue;
  });
}

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "UPDATE_VALUES": {
      const hasChanges = detectChanges(state.values, action.updates);
      const nextErrors = { ...state.errors };

      Object.keys(action.updates).forEach((key) => {
        delete nextErrors[key];
      });

      return {
        values: { ...state.values, ...action.updates },
        errors: nextErrors,
        isDirty: hasChanges,
      };
    }

    case "SET_ERRORS": {
      return {
        ...state,
        errors: action.errors,
      };
    }

    case "UPDATE_FROM_EXTRACTION": {
      const updates: Partial<RecipeMetadataWrite> = {};
      const existingTags = state.values.tags ?? [];

      if (!state.values.title && action.title) {
        updates.title = action.title;
      }

      if (action.suggestedTags && action.suggestedTags.length > 0) {
        const newTags = action.suggestedTags.filter(
          (tag) => !existingTags.includes(tag)
        );
        if (newTags.length > 0) {
          updates.tags = [...existingTags, ...newTags];
        }
      }

      return {
        ...state,
        values: { ...state.values, ...updates },
      };
    }

    default:
      return state;
  }
}

export function useRecipeForm(config: {
  initialValues?: RecipeMetadataWrite;
  onSubmit: (metadata: RecipeMetadataWrite) => void;
}): {
  values: RecipeMetadataWrite;
  errors: Record<string, string>;
  handleChange: (updates: Partial<RecipeMetadataWrite>) => void;
  handleSubmit: () => void;
  isDirty: boolean;
  updateFromExtraction: (
    title?: string,
    suggestedTags?: Array<`#${string}`>
  ) => void;
} {
  const { t } = useTranslation();
  const initialValues = config.initialValues ?? emptyMetadata;

  const [state, dispatch] = useReducer(formReducer, {
    values: initialValues,
    errors: {},
    isDirty: false,
  });

  const handleChange = useCallback((updates: Partial<RecipeMetadataWrite>) => {
    dispatch({ type: "UPDATE_VALUES", updates });
  }, []);

  const handleSubmit = useCallback(() => {
    const newErrors: Record<string, string> = {};

    const tags = state.values.tags ?? [];
    const trimmedValues: RecipeMetadataWrite = {
      title: state.values.title?.trim() || undefined,
      source: state.values.source || undefined,
      tags,
      tagIds: state.values.tagIds,
    };

    if (tags.length > 0 && !validateTags(tags)) {
      newErrors.tags = t("errors.invalidTags");
    }

    if (Object.keys(newErrors).length > 0) {
      dispatch({ type: "SET_ERRORS", errors: newErrors });
      return;
    }

    config.onSubmit(trimmedValues);
  }, [state.values, config, t]);

  const updateFromExtraction = useCallback(
    (title?: string, suggestedTags?: Array<`#${string}`>) => {
      dispatch({ type: "UPDATE_FROM_EXTRACTION", title, suggestedTags });
    },
    []
  );

  return {
    values: state.values,
    errors: state.errors,
    handleChange,
    handleSubmit,
    isDirty: state.isDirty,
    updateFromExtraction,
  };
}

/**
 * Helper hook for tag input field
 * Handles parsing comma/space separated input into tags array
 */
export function useTagInput(
  tags: Array<`#${string}`>,
  onChange: (tags: Array<`#${string}`>) => void
): {
  inputValue: string;
  handleInputChange: (text: string) => void;
  handleInputBlur: () => void;
  handleRemoveTag: (index: number) => void;
} {
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

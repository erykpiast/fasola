import type { RecipeMetadata } from "@/lib/types/recipe";
import { parseTags, validateTags } from "@/lib/utils/recipeValidation";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { useCallback, useMemo, useReducer, useState } from "react";

const emptyMetadata: RecipeMetadata = {
  title: undefined,
  source: undefined,
  tags: [],
};

type FormState = {
  values: RecipeMetadata;
  errors: Record<string, string>;
  isDirty: boolean;
};

type FormAction =
  | { type: "UPDATE_VALUES"; updates: Partial<RecipeMetadata> }
  | { type: "SET_ERRORS"; errors: Record<string, string> }
  | {
      type: "UPDATE_FROM_EXTRACTION";
      title?: string;
      suggestedTags?: Array<`#${string}`>;
    };

function detectChanges(
  current: RecipeMetadata,
  updates: Partial<RecipeMetadata>
): boolean {
  return Object.entries(updates).some(([key, newValue]) => {
    const currentValue = current[key as keyof RecipeMetadata];

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
      const updates: Partial<RecipeMetadata> = {};

      if (!state.values.title && action.title) {
        updates.title = action.title;
      }

      if (action.suggestedTags && action.suggestedTags.length > 0) {
        const newTags = action.suggestedTags.filter(
          (tag) => !state.values.tags.includes(tag)
        );
        if (newTags.length > 0) {
          updates.tags = [...state.values.tags, ...newTags];
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
  initialValues?: RecipeMetadata;
  onSubmit: (metadata: RecipeMetadata) => void;
}): {
  values: RecipeMetadata;
  errors: Record<string, string>;
  handleChange: (updates: Partial<RecipeMetadata>) => void;
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

  const handleChange = useCallback((updates: Partial<RecipeMetadata>) => {
    dispatch({ type: "UPDATE_VALUES", updates });
  }, []);

  const handleSubmit = useCallback(() => {
    const newErrors: Record<string, string> = {};

    const trimmedValues: RecipeMetadata = {
      title: state.values.title?.trim() || undefined,
      source: state.values.source || undefined,
      tags: state.values.tags,
    };

    if (trimmedValues.tags.length > 0 && !validateTags(trimmedValues.tags)) {
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

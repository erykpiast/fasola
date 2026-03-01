import type { Recipe } from "@/lib/types/recipe";
import type { TagId } from "@/lib/types/primitives";
import type { Tag } from "@/lib/types/tag";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { filterRecipes } from "../utils/recipeSearch";

type UseRecipeFilterResult = {
  filteredRecipes: Array<Recipe>;
  isFiltering: boolean;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  clearSearch: () => void;
};

export function useRecipeFilter(
  recipes: Array<Recipe>,
  tagLookup: Map<TagId, Tag>
): UseRecipeFilterResult {
  const [searchTerm, setSearchTerm] = useState("");
  const [isFiltering, startTransition] = useTransition();
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const filteredRecipes = useMemo(() => {
    return filterRecipes(recipes, deferredSearchTerm, tagLookup);
  }, [recipes, deferredSearchTerm, tagLookup]);

  const handleSetSearchTerm = (term: string): void => {
    startTransition(() => {
      setSearchTerm(term);
    });
  };

  const clearSearch = (): void => {
    startTransition(() => {
      setSearchTerm("");
    });
  };

  return {
    filteredRecipes,
    isFiltering,
    searchTerm,
    setSearchTerm: handleSetSearchTerm,
    clearSearch,
  };
}

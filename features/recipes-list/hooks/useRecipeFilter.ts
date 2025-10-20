import type { Recipe } from "@/lib/types/recipe";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { filterRecipes } from "../utils/recipeSearch";

export function useRecipeFilter(recipes: Array<Recipe>) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isFiltering, startTransition] = useTransition();
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const filteredRecipes = useMemo(() => {
    return filterRecipes(recipes, deferredSearchTerm);
  }, [recipes, deferredSearchTerm]);

  const handleSetSearchTerm = (term: string) => {
    startTransition(() => {
      setSearchTerm(term);
    });
  };

  const clearSearch = () => {
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

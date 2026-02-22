import { useSources } from "@/features/sources/context/SourcesContext";
import { isUrl } from "@/lib/utils/recipeValidation";
import { useMemo } from "react";

export function useSourceName(source: string | undefined): {
  displayName: string | undefined;
  isUrl: boolean;
} {
  const { getSourceName } = useSources();
  return useMemo(() => {
    if (!source) return { displayName: undefined, isUrl: false };
    if (isUrl(source)) return { displayName: source, isUrl: true };
    return { displayName: getSourceName(source), isUrl: false };
  }, [source, getSourceName]);
}

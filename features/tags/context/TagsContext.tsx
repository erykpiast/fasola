import { buildTagLookup } from "@/features/tags/utils/resolveRecipeTags";
import { tagsRepository } from "@/lib/repositories/tags";
import type { TagId } from "@/lib/types/primitives";
import type { Tag } from "@/lib/types/tag";
import {
  createContext,
  use,
  useCallback,
  useContext,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from "react";

type TagsContextValue = {
  tags: Array<Tag>;
  tagLookup: Map<TagId, Tag>;
  refreshTags: () => Promise<void>;
};

const TagsContext = createContext<TagsContextValue | null>(null);

let tagsPromise: Promise<Array<Tag>> | null = null;

function getTagsPromise(): Promise<Array<Tag>> {
  if (!tagsPromise) {
    tagsPromise = tagsRepository.getAll();
  }

  return tagsPromise;
}

export function TagsProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const initialTags = use(getTagsPromise());
  const [tags, setTags] = useState<Array<Tag>>(initialTags);

  const refreshTags = useCallback(async (): Promise<void> => {
    const freshTags = await tagsRepository.getAll();
    setTags(freshTags);
  }, []);

  const tagLookup = useMemo((): Map<TagId, Tag> => buildTagLookup(tags), [tags]);

  const value = useMemo(
    (): TagsContextValue => ({
      tags,
      tagLookup,
      refreshTags,
    }),
    [tags, tagLookup, refreshTags]
  );

  return <TagsContext.Provider value={value}>{children}</TagsContext.Provider>;
}

export function useTags(): TagsContextValue {
  const context = useContext(TagsContext);
  if (!context) {
    throw new Error("useTags must be used within TagsProvider");
  }

  return context;
}

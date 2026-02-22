import { sourceRepository } from "@/lib/repositories/sources";
import type { SourceId } from "@/lib/types/primitives";
import type { Source } from "@/lib/types/source";
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

type SourcesContextValue = {
  sources: Array<Source>;
  getSourceName: (id: SourceId) => string | undefined;
  createSource: (name: string) => Promise<Source>;
  renameSource: (id: SourceId, newName: string) => Promise<void>;
  deleteSource: (id: SourceId) => Promise<void>;
  touchSource: (id: SourceId) => Promise<void>;
  getLastUsed: () => Source | null;
  refresh: () => Promise<void>;
};

const SourcesContext = createContext<SourcesContextValue | null>(null);

let sourcesPromise: Promise<Array<Source>> | null = null;

function getSourcesPromise(): Promise<Array<Source>> {
  if (!sourcesPromise) {
    sourcesPromise = sourceRepository.getAll().catch((error) => {
      sourcesPromise = null;
      throw error;
    });
  }
  return sourcesPromise;
}

export function SourcesProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const initialSources = use(getSourcesPromise());
  const [sources, setSources] = useState<Array<Source>>(initialSources);

  const getSourceName = useCallback(
    (id: SourceId): string | undefined => {
      return sources.find((s) => s.id === id)?.name;
    },
    [sources]
  );

  const createSource = useCallback(async (name: string): Promise<Source> => {
    const newSource = await sourceRepository.create(name);
    setSources((prev) => [newSource, ...prev]);
    return newSource;
  }, []);

  const renameSource = useCallback(
    async (id: SourceId, newName: string): Promise<void> => {
      await sourceRepository.rename(id, newName);
      setSources((prev) =>
        prev.map((s) => (s.id === id ? { ...s, name: newName.trim() } : s))
      );
    },
    []
  );

  const deleteSource = useCallback(
    async (id: SourceId): Promise<void> => {
      await sourceRepository.delete(id);
      setSources((prev) => prev.filter((s) => s.id !== id));
    },
    []
  );

  const touchSource = useCallback(
    async (id: SourceId): Promise<void> => {
      await sourceRepository.touch(id);
      setSources((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, lastUsedAt: Date.now() } : s
        )
      );
    },
    []
  );

  const getLastUsed = useCallback((): Source | null => {
    if (sources.length === 0) return null;
    const sorted = [...sources].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    const mostRecent = sorted[0];
    const isWithin24Hours =
      Date.now() - mostRecent.lastUsedAt < 24 * 60 * 60 * 1000;
    return isWithin24Hours ? mostRecent : null;
  }, [sources]);

  const refresh = useCallback(async (): Promise<void> => {
    const freshSources = await sourceRepository.getAll();
    setSources(freshSources);
  }, []);

  const value = useMemo(
    (): SourcesContextValue => ({
      sources,
      getSourceName,
      createSource,
      renameSource,
      deleteSource,
      touchSource,
      getLastUsed,
      refresh,
    }),
    [
      sources,
      getSourceName,
      createSource,
      renameSource,
      deleteSource,
      touchSource,
      getLastUsed,
      refresh,
    ]
  );

  return (
    <SourcesContext.Provider value={value}>{children}</SourcesContext.Provider>
  );
}

export function useSources(): SourcesContextValue {
  const ctx = useContext(SourcesContext);
  if (!ctx) throw new Error("useSources must be used within SourcesProvider");
  return ctx;
}

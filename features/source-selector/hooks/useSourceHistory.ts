import {
  sourceHistoryRepository,
  type SourceHistoryEntry,
} from "@/lib/repositories/sourceHistory";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Hook for managing source history with automatic loading and memoized operations
 */
export function useSourceHistory(): {
  sources: Array<SourceHistoryEntry>;
  lastUsed: string | null;
  isLoading: boolean;
  addSource: (source: string) => Promise<void>;
  refresh: () => Promise<void>;
} {
  const [sources, setSources] = useState<Array<SourceHistoryEntry>>([]);
  const [lastUsed, setLastUsed] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const [recentSources, lastUsedSource] = await Promise.all([
        sourceHistoryRepository.getRecentSources(),
        sourceHistoryRepository.getLastUsedSource(),
      ]);
      setSources(recentSources);
      setLastUsed(lastUsedSource);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const addSource = useCallback(
    async (source: string) => {
      await sourceHistoryRepository.addSource(source);
      await loadHistory();
    },
    [loadHistory]
  );

  const refresh = useCallback(async () => {
    await loadHistory();
  }, [loadHistory]);

  return useMemo(
    () => ({
      sources,
      lastUsed,
      isLoading,
      addSource,
      refresh,
    }),
    [sources, lastUsed, isLoading, addSource, refresh]
  );
}

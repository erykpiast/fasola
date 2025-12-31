import { storage } from "@/lib/storage";
import type { StorageKey } from "@/lib/types/primitives";

const SOURCE_HISTORY_KEY: StorageKey = "@sourceHistory";
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

export interface SourceHistoryEntry {
  source: string;
  lastUsedAt: number;
}

class SourceHistoryRepository {
  /**
   * Get all source history entries sorted by most recent first
   */
  async getRecentSources(): Promise<Array<SourceHistoryEntry>> {
    const data = await storage.getItem(SOURCE_HISTORY_KEY);
    if (!data) {
      return [];
    }

    const entries: Array<SourceHistoryEntry> = JSON.parse(data);
    return entries.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  }

  /**
   * Add or update a source in the history
   */
  async addSource(source: string): Promise<void> {
    const entries = await this.getRecentSources();
    const existingIndex = entries.findIndex((e) => e.source === source);

    if (existingIndex !== -1) {
      entries[existingIndex].lastUsedAt = Date.now();
    } else {
      entries.push({
        source,
        lastUsedAt: Date.now(),
      });
    }

    await storage.setItem(SOURCE_HISTORY_KEY, JSON.stringify(entries));
  }

  /**
   * Get the most recently used source if it was used within the last 24 hours
   */
  async getLastUsedSource(): Promise<string | null> {
    const entries = await this.getRecentSources();
    if (entries.length === 0) {
      return null;
    }

    const mostRecent = entries[0];
    const now = Date.now();
    const isWithin24Hours = now - mostRecent.lastUsedAt < TWENTY_FOUR_HOURS;

    return isWithin24Hours ? mostRecent.source : null;
  }
}

export const sourceHistoryRepository = new SourceHistoryRepository();

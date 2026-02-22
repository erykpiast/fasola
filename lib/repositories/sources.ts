import * as Crypto from "expo-crypto";
import { storage } from "../storage";
import type { SourceId, StorageKey } from "../types/primitives";
import type { Source } from "../types/source";

const SOURCES_KEY: StorageKey = "@sources";
const MAX_SOURCE_NAME_LENGTH = 100;

let lockChain = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = lockChain.then(fn, fn);
  lockChain = next.then(() => {}, () => {});
  return next;
}

class SourceRepository {
  async getAll(): Promise<Array<Source>> {
    const data = await storage.getItem(SOURCES_KEY);
    if (!data) return [];
    try {
      const sources: Array<Source> = JSON.parse(data);
      return sources.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    } catch {
      return [];
    }
  }

  async getById(id: SourceId): Promise<Source | null> {
    const sources = await this.getAll();
    return sources.find((s) => s.id === id) ?? null;
  }

  async create(name: string): Promise<Source> {
    return withLock(async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Source name cannot be empty");
      if (trimmed.length > MAX_SOURCE_NAME_LENGTH) {
        throw new Error("Source name is too long");
      }
      const sources = await this.getAll();
      if (sources.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
        throw new Error("A book with this name already exists");
      }
      const newSource: Source = {
        id: Crypto.randomUUID(),
        name: trimmed,
        lastUsedAt: Date.now(),
      };
      sources.push(newSource);
      await storage.setItem(SOURCES_KEY, JSON.stringify(sources));
      return newSource;
    });
  }

  async rename(id: SourceId, newName: string): Promise<void> {
    return withLock(async () => {
      const trimmed = newName.trim();
      if (!trimmed) throw new Error("Source name cannot be empty");
      if (trimmed.length > MAX_SOURCE_NAME_LENGTH) {
        throw new Error("Source name is too long");
      }
      const sources = await this.getAll();
      if (
        sources.some(
          (s) => s.id !== id && s.name.toLowerCase() === trimmed.toLowerCase()
        )
      ) {
        throw new Error("A book with this name already exists");
      }
      const source = sources.find((s) => s.id === id);
      if (!source) return;
      source.name = trimmed;
      await storage.setItem(SOURCES_KEY, JSON.stringify(sources));
    });
  }

  async delete(id: SourceId): Promise<void> {
    return withLock(async () => {
      const sources = await this.getAll();
      const filtered = sources.filter((s) => s.id !== id);
      await storage.setItem(SOURCES_KEY, JSON.stringify(filtered));
    });
  }

  async touch(id: SourceId): Promise<void> {
    return withLock(async () => {
      const sources = await this.getAll();
      const source = sources.find((s) => s.id === id);
      if (!source) return;
      source.lastUsedAt = Date.now();
      await storage.setItem(SOURCES_KEY, JSON.stringify(sources));
    });
  }
}

export const sourceRepository = new SourceRepository();

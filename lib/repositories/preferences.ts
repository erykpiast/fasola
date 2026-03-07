import { storage } from "../storage";
import { APP_LANGUAGES, type AppLanguage } from "../types/language";
import type { StorageKey } from "../types/primitives";

const UI_LANGUAGE_KEY: StorageKey = "@preferences:uiLanguage";
const OCR_LANGUAGE_KEY: StorageKey = "@preferences:ocrLanguage";

function parseLanguage(value: string | null): AppLanguage {
  return APP_LANGUAGES.includes(value as AppLanguage)
    ? (value as AppLanguage)
    : "en";
}

class PreferencesRepository {
  async getUiLanguage(): Promise<AppLanguage> {
    const value = await storage.getItem(UI_LANGUAGE_KEY);
    return parseLanguage(value);
  }

  async setUiLanguage(lang: AppLanguage): Promise<void> {
    await storage.setItem(UI_LANGUAGE_KEY, lang);
  }

  async getOcrLanguage(): Promise<AppLanguage> {
    const value = await storage.getItem(OCR_LANGUAGE_KEY);
    return parseLanguage(value);
  }

  async setOcrLanguage(lang: AppLanguage): Promise<void> {
    await storage.setItem(OCR_LANGUAGE_KEY, lang);
  }
}

export const preferencesRepository = new PreferencesRepository();

import { storage } from "../storage";
import type { StorageKey } from "../types/primitives";
import type { AppLanguage } from "../types/language";

const UI_LANGUAGE_KEY: StorageKey = "@preferences:uiLanguage";
const OCR_LANGUAGE_KEY: StorageKey = "@preferences:ocrLanguage";

class PreferencesRepository {
  async getUiLanguage(): Promise<AppLanguage> {
    const value = await storage.getItem(UI_LANGUAGE_KEY);
    return value === "pl" ? "pl" : "en";
  }

  async setUiLanguage(lang: AppLanguage): Promise<void> {
    await storage.setItem(UI_LANGUAGE_KEY, lang);
  }

  async getOcrLanguage(): Promise<AppLanguage> {
    const value = await storage.getItem(OCR_LANGUAGE_KEY);
    return value === "pl" ? "pl" : "en";
  }

  async setOcrLanguage(lang: AppLanguage): Promise<void> {
    await storage.setItem(OCR_LANGUAGE_KEY, lang);
  }
}

export const preferencesRepository = new PreferencesRepository();

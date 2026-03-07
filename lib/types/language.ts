/** Supported app languages */
export type AppLanguage = "en" | "pl";

/** All supported languages for iteration */
export const APP_LANGUAGES: ReadonlyArray<AppLanguage> = ["en", "pl"] as const;

/** Display names as endonyms (each language in its own name) */
export const LANGUAGE_DISPLAY_NAMES: Record<AppLanguage, string> = {
  en: "English",
  pl: "Polski",
};

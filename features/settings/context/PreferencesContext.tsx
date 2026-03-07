import { preferencesRepository } from "@/lib/repositories/preferences";
import type { AppLanguage } from "@/lib/types/language";
import i18n from "@/platform/i18n/config";
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

type PreferencesContextValue = {
  uiLanguage: AppLanguage;
  ocrLanguage: AppLanguage;
  setUiLanguage: (lang: AppLanguage) => Promise<void>;
  setOcrLanguage: (lang: AppLanguage) => Promise<void>;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

let preferencesPromise: Promise<{
  uiLanguage: AppLanguage;
  ocrLanguage: AppLanguage;
}> | null = null;

function getPreferencesPromise(): Promise<{
  uiLanguage: AppLanguage;
  ocrLanguage: AppLanguage;
}> {
  if (!preferencesPromise) {
    preferencesPromise = Promise.all([
      preferencesRepository.getUiLanguage(),
      preferencesRepository.getOcrLanguage(),
    ]).then(([uiLanguage, ocrLanguage]) => {
      i18n.changeLanguage(uiLanguage);
      return { uiLanguage, ocrLanguage };
    });
  }
  return preferencesPromise;
}

export function PreferencesProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const initial = use(getPreferencesPromise());
  const [uiLanguage, setUiLanguageState] = useState<AppLanguage>(
    initial.uiLanguage
  );
  const [ocrLanguage, setOcrLanguageState] = useState<AppLanguage>(
    initial.ocrLanguage
  );

  const setUiLanguage = useCallback(
    async (lang: AppLanguage): Promise<void> => {
      await preferencesRepository.setUiLanguage(lang);
      await i18n.changeLanguage(lang);
      setUiLanguageState(lang);
    },
    []
  );

  const setOcrLanguage = useCallback(
    async (lang: AppLanguage): Promise<void> => {
      await preferencesRepository.setOcrLanguage(lang);
      setOcrLanguageState(lang);
    },
    []
  );

  const value = useMemo(
    (): PreferencesContextValue => ({
      uiLanguage,
      ocrLanguage,
      setUiLanguage,
      setOcrLanguage,
    }),
    [uiLanguage, ocrLanguage, setUiLanguage, setOcrLanguage]
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx)
    throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}

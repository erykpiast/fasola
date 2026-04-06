import { createContext, useContext, useState, useCallback, useMemo, type JSX, type ReactNode } from "react";

type DebugData = Record<string, unknown>;

interface DebugContextValue {
  debugData: DebugData | null;
  setDebugData: (data: DebugData | null) => void;
  isVisible: boolean;
  setIsVisible: (visible: boolean) => void;
  toggleVisibility: () => void;
}

const DebugContext = createContext<DebugContextValue | null>(null);

export function DebugProvider(props: { children: ReactNode }): JSX.Element {
  const [debugData, setDebugDataState] = useState<DebugData | null>(null);
  const [isVisible, setIsVisibleState] = useState(false);

  const setDebugData = useCallback((data: DebugData | null) => {
    setDebugDataState(data);
  }, []);

  const setIsVisible = useCallback((visible: boolean) => {
    setIsVisibleState(visible);
  }, []);

  const toggleVisibility = useCallback(() => {
    setIsVisibleState((prev) => !prev);
  }, []);

  const value = useMemo(
    () => ({
      debugData,
      setDebugData,
      isVisible,
      setIsVisible,
      toggleVisibility,
    }),
    [debugData, setDebugData, isVisible, setIsVisible, toggleVisibility]
  );

  return (
    <DebugContext.Provider value={value}>
      {props.children}
    </DebugContext.Provider>
  );
}

export function useDebugContext(): DebugContextValue {
  const context = useContext(DebugContext);
  if (!context) {
    throw new Error("useDebugContext must be used within DebugProvider");
  }
  return context;
}


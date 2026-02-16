import { useRecipes } from "@/features/recipes-list/context/RecipesContext";
import {
  addRemoteChangeListener,
  resolveConflicts,
  startMonitoring,
  stopMonitoring,
  getContainerUrl,
} from "icloud-sync";
import { useEffect, type JSX, type ReactNode } from "react";

export function ICloudSyncProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const { refreshFromStorage } = useRecipes();

  useEffect(() => {
    const containerUrl = getContainerUrl();
    if (!containerUrl) return;

    startMonitoring();

    const base = containerUrl.endsWith("/") ? containerUrl : `${containerUrl}/`;
    const recipesPath = `${base}data/recipes.json`;

    const subscription = addRemoteChangeListener(async () => {
      await resolveConflicts(recipesPath);
      await refreshFromStorage();
    });

    return () => {
      subscription.remove();
      stopMonitoring();
    };
  }, [refreshFromStorage]);

  return <>{children}</>;
}

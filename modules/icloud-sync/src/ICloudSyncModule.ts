import type { EventSubscription } from "expo-modules-core";
import type { AvailabilityChangedEvent, RemoteChangeEvent } from "./types";

export function getContainerUrl(): string | null {
  return null;
}

export function startMonitoring(): void {}

export function stopMonitoring(): void {}

export async function resolveConflicts(_path: string): Promise<void> {}

export async function migrateToContainer(
  _sourcePath: string,
  _containerPath: string
): Promise<void> {}

export function addRemoteChangeListener(
  _listener: (event: RemoteChangeEvent) => void
): EventSubscription {
  return { remove: () => {} } as EventSubscription;
}

export function addAvailabilityChangedListener(
  _listener: (event: AvailabilityChangedEvent) => void
): EventSubscription {
  return { remove: () => {} } as EventSubscription;
}

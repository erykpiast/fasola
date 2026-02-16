import { requireNativeModule } from "expo-modules-core";
import type { EventSubscription } from "expo-modules-core";
import type { AvailabilityChangedEvent, RemoteChangeEvent } from "./types";

interface ICloudSyncNativeModule {
  getContainerUrl(): string | null;
  startMonitoring(): void;
  stopMonitoring(): void;
  resolveConflicts(path: string): Promise<void>;
  migrateToContainer(sourcePath: string, containerPath: string): Promise<void>;
  addListener(
    eventName: "onRemoteChange",
    listener: (event: RemoteChangeEvent) => void
  ): EventSubscription;
  addListener(
    eventName: "onAvailabilityChanged",
    listener: (event: AvailabilityChangedEvent) => void
  ): EventSubscription;
}

// Use try/catch so the app doesn't crash if the native module
// hasn't been compiled in yet (e.g. after adding the module
// but before doing a clean native rebuild).
let NativeModule: ICloudSyncNativeModule | null;
try {
  NativeModule = requireNativeModule<ICloudSyncNativeModule>("ICloudSync");
} catch {
  NativeModule = null;
}

export function getContainerUrl(): string | null {
  return NativeModule?.getContainerUrl() ?? null;
}

export function startMonitoring(): void {
  NativeModule?.startMonitoring();
}

export function stopMonitoring(): void {
  NativeModule?.stopMonitoring();
}

export async function resolveConflicts(path: string): Promise<void> {
  return NativeModule?.resolveConflicts(path);
}

export async function migrateToContainer(
  sourcePath: string,
  containerPath: string
): Promise<void> {
  return NativeModule?.migrateToContainer(sourcePath, containerPath);
}

export function addRemoteChangeListener(
  listener: (event: RemoteChangeEvent) => void
): EventSubscription {
  if (!NativeModule) {
    return { remove: () => {} } as EventSubscription;
  }
  return NativeModule.addListener("onRemoteChange", listener);
}

export function addAvailabilityChangedListener(
  listener: (event: AvailabilityChangedEvent) => void
): EventSubscription {
  if (!NativeModule) {
    return { remove: () => {} } as EventSubscription;
  }
  return NativeModule.addListener("onAvailabilityChanged", listener);
}

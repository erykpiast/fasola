/**
 * Type declarations for usePhotoImport hook.
 * Metro will automatically resolve to the correct platform-specific implementation.
 */

export function usePhotoImport(): {
  startImport: () => Promise<void>;
  isImporting: boolean;
};

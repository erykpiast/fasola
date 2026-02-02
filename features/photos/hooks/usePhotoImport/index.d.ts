/**
 * Type declarations for usePhotoImport hook.
 * Metro will automatically resolve to the correct platform-specific implementation.
 */

export type ImportOption = "camera" | "library";

export function usePhotoImport(): {
  handleOptionSelect: (option: ImportOption) => Promise<void>;
  showPopover: () => void;
  isImporting: boolean;
  popoverVisible: boolean;
  dismissPopover: () => void;
};

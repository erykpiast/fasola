import { useCallback, useMemo } from "react";
import { useTranslation } from "@/platform/i18n/useTranslation";
import {
  usePhotoImport,
  type ImportOption,
} from "@/features/photos/hooks/usePhotoImport";
import { usePopoverTransition } from "@/features/photos/hooks/usePopoverTransition";

export function useImportPopover(): {
  showPopover: () => void;
  popoverVisible: boolean;
  dismissPopover: () => void;
  isImporting: boolean;
  searchBarStyle: ReturnType<typeof usePopoverTransition>["searchBarStyle"];
  buttonStyle: ReturnType<typeof usePopoverTransition>["buttonStyle"];
  importOptions: Array<{ id: string; label: string; systemImage: string }>;
  handleImportOptionSelect: (id: string) => void;
} {
  const { t } = useTranslation();
  const {
    showPopover,
    handleOptionSelect,
    popoverVisible,
    dismissPopover,
    isImporting,
  } = usePhotoImport();
  const { searchBarStyle, buttonStyle } =
    usePopoverTransition(popoverVisible || isImporting);

  const handleImportOptionSelect = useCallback(
    (id: string) => {
      handleOptionSelect(id as ImportOption);
    },
    [handleOptionSelect],
  );

  const importOptions = useMemo(
    () => [
      { id: "camera", label: t("addRecipe.camera"), systemImage: "camera" },
      {
        id: "library",
        label: t("addRecipe.library"),
        systemImage: "photo.on.rectangle",
      },
    ],
    [t],
  );

  return useMemo(
    () => ({
      showPopover,
      popoverVisible,
      dismissPopover,
      isImporting,
      searchBarStyle,
      buttonStyle,
      importOptions,
      handleImportOptionSelect,
    }),
    [
      showPopover,
      popoverVisible,
      dismissPopover,
      isImporting,
      searchBarStyle,
      buttonStyle,
      importOptions,
      handleImportOptionSelect,
    ],
  );
}

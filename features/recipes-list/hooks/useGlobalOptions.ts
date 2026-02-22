import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Platform } from "react-native";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { usePopoverTransition } from "@/features/photos/hooks/usePopoverTransition";

export function useGlobalOptions(): {
  visible: boolean;
  options: Array<{ id: string; label: string; systemImage: string }>;
  handlePress: () => void;
  handleSelect: (id: string) => void;
  handleDismiss: () => void;
  buttonStyle: ReturnType<typeof usePopoverTransition>["buttonStyle"];
} {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const { buttonStyle } = usePopoverTransition(visible);

  const options = useMemo(
    () => [
      {
        id: "manage-books",
        label: t("menu.manageBooks"),
        systemImage: "books.vertical",
      },
    ],
    [t],
  );

  const handlePress = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setVisible(true);
  }, []);

  const handleSelect = useCallback((id: string) => {
    setVisible(false);
    if (id === "manage-books") {
      router.push("/manage-books");
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setVisible(false);
  }, []);

  return useMemo(
    () => ({
      visible,
      options,
      handlePress,
      handleSelect,
      handleDismiss,
      buttonStyle,
    }),
    [visible, options, handlePress, handleSelect, handleDismiss, buttonStyle],
  );
}

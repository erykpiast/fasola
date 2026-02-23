import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Platform } from "react-native";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { usePopoverTransition } from "@/features/photos/hooks/usePopoverTransition";

interface MenuOption {
  id: string;
  label: string;
  systemImage: string;
  route: "/manage-books" | "/about";
}

export function useGlobalOptions(): {
  visible: boolean;
  options: Array<MenuOption>;
  handlePress: () => void;
  handleSelect: (id: string) => void;
  handleDismiss: () => void;
  buttonStyle: ReturnType<typeof usePopoverTransition>["buttonStyle"];
} {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const { buttonStyle } = usePopoverTransition(visible);

  const options = useMemo<Array<MenuOption>>(
    () => [
      {
        id: "manage-books",
        label: t("menu.manageBooks"),
        systemImage: "books.vertical",
        route: "/manage-books",
      },
      {
        id: "about",
        label: t("menu.about"),
        systemImage: "info.circle",
        route: "/about",
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

  const handleSelect = useCallback(
    (id: string) => {
      setVisible(false);
      const selected = options.find((o) => o.id === id);
      if (selected) {
        router.push(selected.route);
      }
    },
    [options],
  );

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

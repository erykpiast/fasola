import { Stack } from "expo-router";
import "../platform/i18n/config";
import * as SystemUI from 'expo-system-ui';
import { useEffect } from "react";
import { useTheme } from "../platform/theme/useTheme";

export default function RootLayout(): JSX.Element {
  const theme = useTheme();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme === 'dark' ? '#000000' : '#F5F5F5');
  }, [theme]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

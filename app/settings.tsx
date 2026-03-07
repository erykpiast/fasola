import { usePreferences } from "@/features/settings/context/PreferencesContext";
import {
  APP_LANGUAGES,
  LANGUAGE_DISPLAY_NAMES,
  type AppLanguage,
} from "@/lib/types/language";
import { LiquidGlassButton } from "@/modules/liquid-glass";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { getColors } from "@/platform/theme/glassStyles";
import { useTheme } from "@/platform/theme/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { type JSX, useCallback } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function LanguageOption({
  lang,
  selected,
  onPress,
}: {
  lang: AppLanguage;
  selected: boolean;
  onPress: (lang: AppLanguage) => void;
}): JSX.Element {
  const theme = useTheme();
  const isDark = theme === "dark";
  const textColor = isDark ? "#FFFFFF" : "#000000";

  const handlePress = useCallback(() => {
    onPress(lang);
  }, [lang, onPress]);

  return (
    <Pressable
      onPress={handlePress}
      style={styles.optionRow}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      <Text style={[styles.optionLabel, { color: textColor }]}>
        {LANGUAGE_DISPLAY_NAMES[lang]}
      </Text>
      {selected && (
        <Ionicons
          name="checkmark"
          size={20}
          color={isDark ? "#0A84FF" : "#007AFF"}
        />
      )}
    </Pressable>
  );
}

export default function SettingsScreen(): JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const colors = getColors(theme);
  const insets = useSafeAreaInsets();
  const isDark = theme === "dark";
  const textColor = isDark ? "#FFFFFF" : "#000000";
  const { uiLanguage, ocrLanguage, setUiLanguage, setOcrLanguage } =
    usePreferences();

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={[styles.headerTitle, { color: textColor }]}>
          {t("settings.title")}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
            {t("settings.uiLanguage")}
          </Text>
          {APP_LANGUAGES.map((lang) => (
            <LanguageOption
              key={lang}
              lang={lang}
              selected={uiLanguage === lang}
              onPress={setUiLanguage}
            />
          ))}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
            {t("settings.ocrLanguage")}
          </Text>
          {APP_LANGUAGES.map((lang) => (
            <LanguageOption
              key={lang}
              lang={lang}
              selected={ocrLanguage === lang}
              onPress={setOcrLanguage}
            />
          ))}
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <LiquidGlassButton
          onPress={handleBack}
          systemImage="chevron.left"
          accessibilityLabel={t("accessibility.back")}
        />
        <View style={styles.spacer} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 28,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: "bold",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 28,
    paddingBottom: 120,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  optionLabel: {
    fontSize: 17,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 28,
    paddingBottom: 28,
  },
  spacer: {
    flex: 1,
  },
});

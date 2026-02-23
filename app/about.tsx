import { LiquidGlassButton } from "@/modules/liquid-glass";
import { useTranslation } from "@/platform/i18n/useTranslation";
import { getColors } from "@/platform/theme/glassStyles";
import { useTheme } from "@/platform/theme/useTheme";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { type JSX, useCallback } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const FEEDBACK_EMAIL = "eryk.napierala@gmail.com";
const FEEDBACK_SUBJECT = "fasola%20feedback";
const GITHUB_URL = "https://github.com/erykpiast/fasola";

export default function AboutScreen(): JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const colors = getColors(theme);
  const insets = useSafeAreaInsets();
  const isDark = theme === "dark";
  const textColor = isDark ? "#FFFFFF" : "#000000";

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  const handleGitHub = useCallback(async () => {
    try {
      await WebBrowser.openBrowserAsync(GITHUB_URL);
    } catch {
      Linking.openURL(GITHUB_URL);
    }
  }, []);

  const handleFeedback = useCallback(async () => {
    try {
      await Linking.openURL(`mailto:${FEEDBACK_EMAIL}?subject=${FEEDBACK_SUBJECT}`);
    } catch {
      // Mail client may not be configured
    }
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={[styles.headerTitle, { color: textColor }]}>
          {t("about.title")}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Intro */}
        <View style={styles.section}>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {t("about.intro")}
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary, marginTop: 16 }]}>
            {t("about.onDevice")}
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary, marginTop: 16 }]}>
            {t("about.openSource")}
          </Text>
          <Pressable onPress={handleGitHub} style={styles.linkRow} accessibilityRole="link">
            <Ionicons name="logo-github" size={18} color={colors.text} />
            <Text style={[styles.link, { color: colors.text }]}>
              {t("about.githubLink")}
            </Text>
          </Pressable>
        </View>

        {/* Author */}
        <View style={styles.section}>
          <Text style={[styles.name, { color: textColor }]}>
            {t("about.author")}
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary, marginTop: 8, marginBottom: 16 }]}>
            {t("about.authorBio")}
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {t("about.authorEmail")}
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {t("about.authorCopyright")}
          </Text>
        </View>

        {/* Get help */}
        <View style={styles.section}>
          <Text style={[styles.name, { color: textColor }]}>
            {t("about.getHelp")}
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {t("about.helpText1")}
          </Text>
          <Pressable onPress={handleFeedback} style={[styles.linkRow, { marginTop: 16 }]} accessibilityRole="link">
            <Ionicons name="mail-outline" size={18} color={colors.text} />
            <Text style={[styles.link, { color: colors.text }]}>
              {t("about.helpText2")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <LiquidGlassButton
          onPress={handleBack}
          systemImage="chevron.left"
          accessibilityLabel={t("accessibility.back")}
        />
        <View style={styles.spacer} />
        <LiquidGlassButton
          onPress={handleFeedback}
          systemImage="envelope"
          accessibilityLabel={t("about.helpCta")}
        />
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
  body: {
    fontSize: 16,
    lineHeight: 22,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  link: {
    fontSize: 16,
    lineHeight: 22,
  },
  name: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 4,
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

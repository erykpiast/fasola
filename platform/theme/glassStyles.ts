import { Theme } from "./useTheme";

export const GLASS_SPRING_CONFIG = {
  damping: 15,
  stiffness: 150,
  mass: 0.5,
};

export const GLASS_INPUT_HEIGHT = 48;
export const GLASS_BORDER_RADIUS = GLASS_INPUT_HEIGHT / 2;

export const colors = {
  light: {
    background: "#F5F5F5",
    text: "#6262a5",
    glassBackground: "rgba(255, 255, 255, 0.7)",
    glassBorder: "rgba(255, 255, 255, 0.3)",
    glassPressedOverlay: "rgba(0, 0, 0, 0.05)",
  },
  dark: {
    background: "#000000",
    text: "#FFFFFF",
    glassBackground: "rgba(0, 0, 0, 0.7)",
    glassBorder: "rgba(255, 255, 255, 0.1)",
    glassPressedOverlay: "rgba(255, 255, 255, 0.15)",
  },
};

export function getColors(theme: Theme): typeof colors.light {
  return colors[theme];
}

export function getGlassInputColors(theme: Theme): {
  label: { color: string };
  text: { color: string };
  placeholder: { color: string };
} {
  const isDark = theme === "dark";

  return {
    label: {
      color: isDark ? "#E5E5E5" : "#1F1F1F",
    },
    text: {
      color: isDark ? "#FFFFFF" : "#000000",
    },
    placeholder: {
      color: isDark ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.4)",
    },
  };
}

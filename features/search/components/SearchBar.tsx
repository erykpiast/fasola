import { useTranslation } from "@/platform/i18n/useTranslation";
import { getColors } from "@/platform/theme/glassStyles";
import { useTheme } from "@/platform/theme/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { GlassView } from "expo-glass-effect";
import { type JSX } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

const SPRING_CONFIG = {
  damping: 15,
  stiffness: 150,
  mass: 0.5,
};

export function SearchBar({
  value,
  onChangeText,
  onFocus,
  onBlur,
  isFocused,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  isFocused: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const colors = getColors(theme);
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: withSpring(1 + pressed.value * 0.02, SPRING_CONFIG) },
      ],
    };
  });

  const overlayStyle = useAnimatedStyle(() => {
    return {
      opacity: withSpring(pressed.value, SPRING_CONFIG),
    };
  });

  return (
    <Animated.View
      style={[styles.glassContainer, animatedStyle]}
      onTouchStart={() => {
        pressed.value = 1;
      }}
      onTouchEnd={() => {
        pressed.value = 0;
      }}
      onTouchCancel={() => {
        pressed.value = 0;
      }}
    >
      <GlassView style={styles.glassInner}>
        <View style={styles.content}>
          <Ionicons
            name="search"
            size={20}
            color={colors.text + "80"}
            style={styles.icon}
          />
          <TextInput
            value={value}
            onChangeText={onChangeText}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder={t("search.placeholder")}
            placeholderTextColor={colors.text + "80"}
            style={[styles.input, { color: colors.text }]}
            returnKeyType="search"
          />
          {value.length > 0 && isFocused && (
            <Pressable
              onPress={() => onChangeText("")}
              style={({ pressed }) => [
                styles.clearButton,
                { opacity: pressed ? 0.5 : 1 },
              ]}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={20} color={colors.text} />
            </Pressable>
          )}
        </View>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: colors.glassPressedOverlay,
              borderRadius: 28,
            },
            overlayStyle,
          ]}
          pointerEvents="none"
        />
      </GlassView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glassContainer: {
    flex: 1,
  },
  glassInner: {
    flex: 1,
    borderRadius: 28,
    overflow: "hidden",
  },
  content: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  icon: {
    marginLeft: 8,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: 40,
  },
  clearButton: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
});

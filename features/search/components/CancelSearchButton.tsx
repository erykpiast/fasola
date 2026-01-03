import { Ionicons } from "@expo/vector-icons";
import { getColors } from "@/platform/theme/glassStyles";
import { useTheme } from "@/platform/theme/useTheme";
import { type JSX } from "react";
import { GlassButton } from "@/lib/components/atoms/GlassButton";

export function CancelSearchButton({
  onPress,
}: {
  onPress: () => void;
}): JSX.Element {
  const theme = useTheme();
  const colors = getColors(theme);

  return (
    <GlassButton onPress={onPress}>
      <Ionicons name="close" size={28} color={colors.text} />
    </GlassButton>
  );
}

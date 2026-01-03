import { Ionicons } from "@expo/vector-icons";
import { getColors } from "@/platform/theme/glassStyles";
import { useTheme } from "@/platform/theme/useTheme";
import { type JSX } from "react";
import { usePhotoImport } from "../../photos/hooks/usePhotoImport";
import { GlassButton } from "@/lib/components/atoms/GlassButton";

export function AddRecipeButton(): JSX.Element {
  const theme = useTheme();
  const colors = getColors(theme);
  const { startImport } = usePhotoImport();

  return (
    <GlassButton onPress={startImport}>
      <Ionicons name="add" size={28} color={colors.text} />
    </GlassButton>
  );
}

import { useCallback, useState } from "react";
import { Keyboard } from "react-native";

export function useSearchFocus(): {
  isFocused: boolean;
  handleFocus: () => void;
  handleBlur: () => void;
  handleCancel: () => void;
} {
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  const handleCancel = useCallback(() => {
    setIsFocused(false);
    Keyboard.dismiss();
  }, []);

  return {
    isFocused,
    handleFocus,
    handleBlur,
    handleCancel,
  };
}

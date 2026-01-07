import { useCallback, useState } from "react";
import { Keyboard } from "react-native";

function getRandomKey(): string {
  return Math.random().toString(36).substring(2, 15);
}

export function useSearchFocus(): {
  key: string;
  isFocused: boolean;
  handleFocus: () => void;
  handleBlur: () => void;
  handleCancel: () => void;
} {
  const [isFocused, setIsFocused] = useState(false);
  const [key, setKey] = useState(getRandomKey());

  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  const handleCancel = useCallback(() => {
    setIsFocused(false);
    setKey(getRandomKey());
    Keyboard.dismiss();
  }, [setKey]);

  return {
    key,
    isFocused,
    handleFocus,
    handleBlur,
    handleCancel,
  };
}

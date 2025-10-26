/**
 * Type declarations for Alert module.
 * Metro will automatically resolve to the correct platform-specific implementation.
 */

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
}

export const Alert: {
  alert(title: string, message?: string, buttons?: Array<AlertButton>): void;
};

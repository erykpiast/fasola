interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
}

const Alert = {
  alert(title: string, message?: string, buttons?: Array<AlertButton>): void {
    if (!buttons || buttons.length === 0) {
      window.alert(`${title}${message ? `\n\n${message}` : ""}`);
      return;
    }

    if (buttons.length === 1) {
      window.alert(`${title}${message ? `\n\n${message}` : ""}`);
      buttons[0].onPress?.();
      return;
    }

    const confirmed = window.confirm(
      `${title}${message ? `\n\n${message}` : ""}`
    );

    const destructiveButton = buttons.find((b) => b.style === "destructive");
    const cancelButton = buttons.find((b) => b.style === "cancel");
    const defaultButton = buttons.find(
      (b) => !b.style || b.style === "default"
    );

    if (confirmed) {
      (destructiveButton || defaultButton)?.onPress?.();
    } else {
      cancelButton?.onPress?.();
    }
  },
};

export { Alert };
export type { AlertButton };

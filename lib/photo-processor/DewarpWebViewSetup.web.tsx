import type { JSX } from "react";
import type { DewarpMessage } from "./types";

interface DewarpWebViewSetupProps {
  onReady?: () => void;
  onMessage?: (message: DewarpMessage) => void;
}

// No-op send function for web (not needed, we use direct integration)
export function sendToWebView(_message: DewarpMessage): void {
  // Web platform uses direct page-dewarp-js integration, no WebView needed
}

// No-op component for web platform
export function DewarpWebViewSetup(
  _props: DewarpWebViewSetupProps
): JSX.Element | null {
  // Web platform doesn't need a WebView
  return null;
}



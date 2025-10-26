/**
 * Stub for web platform - WebView setup is not needed on web.
 * OpenCV.js runs directly in the browser context.
 */

import { type JSX } from "react";

/**
 * No-op component for web platform.
 * OpenCV runs directly without WebView.
 */
export function OpenCVWebViewSetup(): JSX.Element | null {
  return null;
}

/**
 * Native stub — all image processing goes through native modules.
 * The WebView OpenCV bridge is only used on web.
 */

import type { JSX } from "react";
import type { DataUrl } from "@/lib/types/primitives";
import type {
  GeometryProcessingResult,
  LightingProcessingResult,
  ClarityProcessingResult,
} from "./types";

export function setOpenCVReady(): void {}

export function handleOpenCVMessage(_message: unknown): void {}

export async function processGeometry(
  _imageUri: DataUrl,
  _config: Record<string, unknown>
): Promise<GeometryProcessingResult> {
  return { success: false, error: "Use native geometry module on iOS" };
}

export async function processLighting(
  _imageUri: DataUrl,
  _config: Record<string, unknown>
): Promise<LightingProcessingResult> {
  return { success: false, error: "Lighting not available on native" };
}

export async function processClarity(
  _imageUri: DataUrl,
  _config: Record<string, unknown>
): Promise<ClarityProcessingResult> {
  return { success: false, error: "Clarity not available on native" };
}

export function OpenCVBridgeSetup(_props?: {
  onReady?: () => void;
  onMessage?: (message: unknown) => void;
}): JSX.Element | null {
  return null;
}

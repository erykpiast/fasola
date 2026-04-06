/**
 * Web stub — geometry processing on web is not currently supported.
 * All image processing goes through native modules on iOS.
 */

import type { JSX } from "react";
import type { DataUrl } from "@/lib/types/primitives";
import type {
  GeometryProcessingResult,
  LightingProcessingResult,
  ClarityProcessingResult,
} from "./types";

export async function processGeometry(
  _imageUri: DataUrl,
  _config: Record<string, unknown>
): Promise<GeometryProcessingResult> {
  return { success: false, error: "Geometry not available on web" };
}

export function setOpenCVReady(): void {}

export function handleOpenCVMessage(_message: unknown): void {}

export async function processLighting(
  _imageUri: DataUrl,
  _config: Record<string, unknown>
): Promise<LightingProcessingResult> {
  return { success: false, error: "Lighting not available on web" };
}

export async function processClarity(
  _imageUri: DataUrl,
  _config: Record<string, unknown>
): Promise<ClarityProcessingResult> {
  return { success: false, error: "Clarity not available on web" };
}

export function OpenCVBridgeSetup(): JSX.Element | null {
  return null;
}

import { requireNativeModule } from "expo-modules-core";

import type { TextObservation } from "./types";

interface ExpoTextExtractorModuleType {
  isSupported: boolean;
  extractTextFromImage: (uri: string) => Promise<string[]>;
  extractTextWithBounds: (uri: string) => Promise<TextObservation[]>;
}

export default requireNativeModule<ExpoTextExtractorModuleType>(
  "ExpoTextExtractor"
);

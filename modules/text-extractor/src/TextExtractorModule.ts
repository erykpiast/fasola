import { requireNativeModule } from "expo-modules-core";

import type { TextObservation } from "./types";

interface TextExtractorModuleType {
  extractText: (uri: string) => Promise<TextObservation[]>;
}

export default requireNativeModule<TextExtractorModuleType>("TextExtractor");

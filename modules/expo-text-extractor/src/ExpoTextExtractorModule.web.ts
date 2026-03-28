import type { TextObservation } from "./types";

export default {
  isSupported: false,
  extractTextFromImage: async (_uri: string): Promise<string[]> => [],
  extractTextWithBounds: async (_uri: string): Promise<TextObservation[]> => [],
};

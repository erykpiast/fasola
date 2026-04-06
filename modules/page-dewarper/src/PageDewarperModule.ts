import { requireNativeModule } from "expo-modules-core";

export interface DewarpResult {
  colorUri: string;
  bwUri: string;
}

interface PageDewarperModuleType {
  dewarpImage: (uri: string) => Promise<DewarpResult>;
}

export default requireNativeModule<PageDewarperModuleType>("PageDewarper");

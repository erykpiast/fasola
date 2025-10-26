/**
 * Type declarations for Storage module.
 * Metro will automatically resolve to the correct platform-specific implementation.
 */

import type { Storage } from "./types";

export type { PhotoMetadata, PhotoWithUri, Storage } from "./types";

export const storage: Storage;

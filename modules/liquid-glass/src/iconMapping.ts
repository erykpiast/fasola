/**
 * Maps Ionicons names to SF Symbol names for cross-platform compatibility
 */
export const ioniconsToSFSymbol: Record<string, string> = {
  add: "plus",
  close: "xmark",
  search: "magnifyingglass",
  "chevron-down": "chevron.down",
  "close-circle": "xmark.circle.fill",
  checkmark: "checkmark",
  trash: "trash",
  create: "pencil",
  settings: "gearshape",
  person: "person",
  camera: "camera",
  image: "photo",
  images: "photo.on.rectangle",
  menu: "line.3.horizontal",
  heart: "heart",
  "heart-outline": "heart",
  star: "star.fill",
  "star-outline": "star",
  "arrow-back": "chevron.left",
  "arrow-forward": "chevron.right",
  "arrow-up": "chevron.up",
  "arrow-down": "chevron.down",
};

/**
 * Convert Ionicons name to SF Symbol name
 * @param ioniconName The Ionicons name
 * @returns The corresponding SF Symbol name, or the original name if no mapping exists
 */
export function toSFSymbol(ioniconName: string): string {
  return ioniconsToSFSymbol[ioniconName] ?? ioniconName;
}

# Thumbnails Plan

## Context

The recipe grid loads full-resolution images (~3000px processed, arbitrary original sizes) into ~130pt cells. With 100+ recipes this causes severe scroll jank. The fix: generate and store 400px JPEG thumbnails alongside each photo, use them in the grid, and keep them in sync with the processed image.

## Design Decisions

- **Generation**: `expo-image-manipulator` — native resize, no WebView overhead. Works on web too (canvas internally).
- **Naming**: `<id>_thumb.jpg` in the same `photos/` directory. No schema migration, iCloud syncs automatically.
- **Dimensions**: 400px longest edge, JPEG quality 0.7 (~20-40KB per thumbnail).
- **Data model**: `thumbnailUri` added as runtime-only optional field on `Recipe`. Resolved by convention in `getAll()`, not persisted to JSON.
- **FlashList**: Replace `FlatList` with `@shopify/flash-list` for cell recycling. Secondary optimization but low effort.

## Steps

### 1. Install dependencies

```
npm install expo-image-manipulator @shopify/flash-list
```

Both require native rebuild (`npx expo run:ios`).

### 2. Create thumbnail generation utility

**New file: `lib/thumbnails/generate.ts`**

Single cross-platform file using `expo-image-manipulator`:
- `generateThumbnail(sourceUri: PhotoUri): Promise<PhotoUri>` — resize to max 400px, JPEG 0.7, return temp URI.

### 3. Extend Storage interface

**`lib/storage/types.ts`** — add three methods:

```ts
saveThumbnail(id: PhotoId, sourceUri: PhotoUri): Promise<void>;
getThumbnail(id: PhotoId): Promise<PhotoUri | null>;
deleteThumbnail(id: PhotoId): Promise<void>;
```

### 4. Implement in NativeStorage

**`lib/storage/index.native.ts`** — add to `NativeStorage`:

- `saveThumbnail`: call `generateThumbnail(sourceUri)`, copy result to `<photosDir>/<id>_thumb.jpg`
- `getThumbnail`: check if `<id>_thumb.jpg` exists, return URI or null
- `deleteThumbnail`: delete `<id>_thumb.jpg` if exists

No metadata.json changes — thumbnails are a derived artifact, not tracked in the index.

### 5. Implement in WebStorage

**`lib/storage/index.web.ts`** — add to `WebStorage`:

- `saveThumbnail`: call `generateThumbnail(sourceUri)`, fetch as blob, store in localforage keyed `<id>_thumb`
- `getThumbnail`: get blob from localforage, return `URL.createObjectURL()` or null
- `deleteThumbnail`: `localforage.removeItem(<id>_thumb)`

### 6. Wire into repository operations

**`lib/repositories/recipes.ts`**:

- `savePending()`: after `storage.savePhoto(...)`, call `storage.saveThumbnail(id, resolvedPhotoUri)`. Wrap in try/catch — thumbnail failure must not break import.
- `save()`: same pattern after `storage.savePhoto(...)`.
- `updateComplete()`: after `storage.savePhoto(id, processedPhotoUri, ...)`, regenerate thumbnail from the fresh photo URI.
- `delete()`: after `storage.deletePhoto(id)`, call `storage.deleteThumbnail(id)`.
- `getAll()`: resolve `thumbnailUri` alongside `photoUri` for each recipe. Fallback to `photoUri` if thumbnail missing.

### 7. Add `thumbnailUri` to Recipe type

**`lib/types/recipe.ts`**:

```ts
export interface Recipe {
  // ... existing fields ...
  thumbnailUri?: PhotoUri; // Runtime-resolved, not persisted
}
```

### 8. Update RecipeGrid

**`features/recipes-list/components/RecipeGrid.tsx`**:

- Replace `FlatList` import with `FlashList` from `@shopify/flash-list`
- Pass `recipe.thumbnailUri || recipe.photoUri` to `RecipeImageDisplay`
- Add `estimatedItemSize={ITEM_SIZE}`
- Replace `columnWrapperStyle` with item-level margins (FlashList handles columns differently)

## Files Modified

| File | Change |
|------|--------|
| `package.json` | Add `expo-image-manipulator`, `@shopify/flash-list` |
| `lib/thumbnails/generate.ts` | **New** — thumbnail generation |
| `lib/storage/types.ts` | Add 3 thumbnail methods to `Storage` interface |
| `lib/storage/index.native.ts` | Implement thumbnail methods |
| `lib/storage/index.web.ts` | Implement thumbnail methods |
| `lib/types/recipe.ts` | Add optional `thumbnailUri` |
| `lib/repositories/recipes.ts` | Generate/resolve thumbnails in CRUD operations |
| `features/recipes-list/components/RecipeGrid.tsx` | Use `thumbnailUri`, swap to FlashList |

No backfill needed — app is unpublished. If a thumbnail is missing, `getAll()` falls back to full photo URI.

## Verification

1. `npm install` + `npx expo run:ios` (native rebuild required)
2. Import a new recipe — confirm `<id>_thumb.jpg` appears in photos directory alongside `<id>.jpg`
3. Wait for processing to complete — confirm thumbnail is regenerated (file timestamp updated)
4. Open recipe grid — confirm smooth scrolling
5. Open recipe detail — confirm full-res image still loads (not thumbnail)
6. Delete a recipe — confirm both `.jpg` and `_thumb.jpg` are removed

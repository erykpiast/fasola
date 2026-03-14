---
schema: 1
id: 7
title: When adding a receipt by taking a photo, the picture that loads is a thumbnail, not a full picture.
status: planned
created: "2026-03-09T22:55:23.616Z"
updated: "2026-03-09T22:55:23.616Z"
tags:
  - bug
dependencies: []
---

## Implementation Plan

Now I have everything I need. Here's the implementation plan:

## Relevant Files

- **`features/photos/hooks/usePhotoImport/index.native.ts`** — Photo capture hook; `launchCameraAsync` and `launchImageLibraryAsync` both use `quality: 0.8`
- **`features/recipe-form/components/AddRecipeForm.tsx`** — Displays the captured photo URI directly in an `<Image>` component before saving
- **`app/recipe/add.tsx`** — Add recipe screen; passes the raw ImagePicker URI as `photoUri` to `AddRecipeForm`
- **`lib/repositories/recipes.ts`** — `savePending()` copies the photo to storage via `storage.savePhoto()`, then generates a thumbnail
- **`lib/storage/index.native.ts`** — `savePhoto()` copies the file as-is; `saveThumbnail()` generates a 400px thumbnail
- **`lib/thumbnails/generate.ts`** — Generates 400px-wide thumbnail at 0.7 quality using `expo-image-manipulator`
- **`lib/components/atoms/ProgressiveImage.tsx`** — Shows thumbnail overlay that fades to full image on load
- **`features/recipes-list/components/RecipeGrid.tsx`** — Grid uses `recipe.thumbnailUri || recipe.photoUri` for display

## Analysis

When `launchCameraAsync` is called with `quality: 0.8`, `expo-image-picker` on iOS re-encodes the captured image as a compressed JPEG before returning the URI. On iOS, this can cause the returned image to be significantly smaller than the original camera capture — iOS's `UIImagePickerController` applies the quality factor during JPEG compression, which on some devices/iOS versions returns a downscaled representation rather than just a quality-reduced full-resolution image.

The flow is:
1. Camera captures → `expo-image-picker` applies `quality: 0.8` → returns a URI to a compressed/downscaled image
2. This URI is passed to `AddRecipeForm` and displayed as the preview (looks like a thumbnail)
3. The same compressed image is saved to storage and used as the source for the 400px thumbnail
4. In the recipe preview screen, `ProgressiveImage` shows the thumbnail first, then loads the "full" image — but since both originate from the same quality-reduced capture, neither looks sharp

The fix is straightforward: set `quality: 1` for camera capture to get the full-resolution image. The app already generates proper thumbnails for grid display (400px at 0.7 quality), so there's no need to pre-compress at the capture stage. The library picker should also be updated for consistency, though the bug title specifically mentions camera capture.

## Steps

1. **In `features/photos/hooks/usePhotoImport/index.native.ts` line 29**: Change `quality: 0.8` to `quality: 1` in `importFromCamera`'s `launchCameraAsync` call. This ensures the full-resolution camera image is returned.

2. **In `features/photos/hooks/usePhotoImport/index.native.ts` line 56**: Change `quality: 0.8` to `quality: 1` in `importFromLibrary`'s `launchImageLibraryAsync` call for consistency. The library picker has the same issue — it returns a compressed version rather than the original.

3. **No changes needed to storage or thumbnail logic.** The storage layer (`savePhoto`) copies the file as-is, and thumbnail generation (`saveThumbnail` → `generateThumbnail`) already handles resizing to 400px at 0.7 quality independently. Full-resolution originals are stored and downscaled thumbnails are generated separately — this is the correct architecture.

4. **No changes needed to display components.** `AddRecipeForm` displays the raw URI, `ProgressiveImage` handles the thumbnail-to-full transition, and `RecipeGrid` correctly uses `thumbnailUri` for the grid. All of these work correctly once the source image is full resolution.

## Testing

1. **Camera capture**: Take a photo via the camera option. On the AddRecipeForm screen, the image should appear sharp and full-resolution, not pixelated or blurry.
2. **Library import**: Import a high-resolution photo from the library. Verify it also displays at full resolution on the add screen.
3. **Storage verification**: After saving a recipe, navigate to the recipe preview screen. The image should load as a sharp thumbnail first (via `ProgressiveImage`), then transition to the full-resolution image.
4. **Grid display**: On the main recipes grid, verify thumbnails still load quickly (they're generated at 400px, not affected by this change).
5. **Background processing**: Confirm that OCR/dewarping operates on the full-resolution image, which should improve text recognition quality as a side benefit.

---
schema: 1
id: 11
title: The photo preview when adding the recipe shouldn't be stretched to a cover but show the full photo to avoid confusiopn that something was cut off
status: planned
created: "2026-03-12T22:46:45.354Z"
updated: "2026-03-12T22:46:45.354Z"
tags:
  - ux
dependencies: []
---

## Implementation Plan

## Relevant Files

- **`features/recipe-form/components/AddRecipeForm.tsx`** — The main file with the issue. Line 86 uses `contentFit="cover"` on the photo preview `Image` component, causing the image to be cropped to fill the container.
- **`app/recipe/add.tsx`** — Screen wrapper that renders `AddRecipeForm` with the photo URI.

## Analysis

When a user adds a recipe (e.g., from camera or photo library), `AddRecipeForm` displays a full-screen preview of the selected photo. The `Image` component on line 83-87 uses `contentFit="cover"`, which scales the image to completely fill the container and crops any overflow. For recipe photos (often tall/portrait documents), this cuts off content and gives the misleading impression that parts of the recipe are missing.

The fix is to switch to `contentFit="contain"`, which scales the image to fit entirely within the container without cropping. The background color is already set per theme (black in dark mode, white in light mode) via `getThemeColors`, so any letterboxing will look clean.

## Steps

1. **Change `contentFit` from `"cover"` to `"contain"`** in `AddRecipeForm.tsx` line 86:
   ```tsx
   contentFit="contain"
   ```

2. **No style changes needed** — the `processingImage` style already uses `flex: 1, width: "100%", height: "100%"` which correctly defines the container bounds. With `contain`, the image will scale down to fit entirely within these bounds, showing the full photo with letterboxing as needed.

## Testing

1. Open the app and tap the add/import button to take a photo or select from library
2. Select a tall/portrait recipe photo — verify the entire image is visible without cropping
3. Select a wide/landscape photo — verify it also displays fully without cropping
4. Confirm the background behind letterbox areas matches the theme (black in dark mode, white in light mode)
5. Verify the bottom bar (close button, source selector, confirm button) still overlays correctly on the image
6. Test on both iOS and Android (or web) to confirm consistent behavior

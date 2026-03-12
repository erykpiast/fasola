---
schema: 1
id: 8
title: Moving the photo on preview or on the edit screen should allow showing the very top of the photo
status: planned
created: "2026-03-09T22:58:29.382Z"
updated: "2026-03-09T22:58:29.382Z"
tags:
  - bug
  - ux
dependencies: []
---

When there's a notch, it's hard to move the image to reveal its very top part.

## Implementation Plan

## Relevant Files

- **`lib/components/atoms/ZoomableImage.tsx`** — Core zoom/pan wrapper using `ResumableZoom` from `react-native-zoom-toolkit`. Pan is disabled entirely when not zoomed; no `panMode` is set (defaults to `"clamp"`, which hard-stops at bounds).
- **`features/recipe-preview/components/RecipeViewScreen.tsx`** — Preview screen. Container is full-screen `{width, height}`. No safe area insets applied; the image starts behind the notch.
- **`features/recipe-preview/components/MetadataOverlay.tsx`** — Gradient overlay with hardcoded `paddingTop: 80`. Covers the top of the image.
- **`features/recipe-form/components/EditRecipeForm.tsx`** — Edit screen. Image in a square container `{width, height: width}` at the top of a ScrollView. Same ZoomableImage, same limitations.
- **`lib/hooks/useImageCoverSize.ts`** — Computes cover-fit dimensions. No safe area awareness.

## Analysis

**What's happening now**: When a user zooms into a photo, `ResumableZoom` calculates pan bounds symmetrically: `boundY = (childHeight × scale − rootHeight) / 2`. On devices with a notch, the top ~59px of the image is physically hidden behind the Dynamic Island / notch. The symmetric bounds allow equal panning up and down from center, but the viewable area is asymmetric — the user needs *more* upward travel than the bounds allow to reveal content hidden behind the notch.

Additionally, `panMode` defaults to `"clamp"`, which hard-stops at the calculated bounds. This means the user hits an invisible wall and has no way to reveal the image's top edge.

At `minScale=1`, pan is disabled entirely (`panEnabled={false}`), so even slight adjustments are impossible.

**What needs to change**: Two things:

1. **Add `panMode="friction"`** — This is the standard iOS rubber-band behavior. When the user pans beyond the calculated bounds, the image moves with resistance and snaps back. This lets users temporarily pull the image down to peek at the top, matching native iOS scroll/zoom behavior.

2. **Offset pan bounds for the notch on the preview screen** — The preview screen renders the image full-screen behind the notch. By shifting the image's effective position down by `insets.top`, the zoom bounds become asymmetric in the correct way: more travel toward the top (where the notch steals space) and less toward the bottom.

## Steps

1. **Add `panMode` prop to `ZoomableImage`**

   In `lib/components/atoms/ZoomableImage.tsx`:
   - Import `PanMode` type from `react-native-zoom-toolkit` (or use string literal type `"clamp" | "free" | "friction"`).
   - Add optional `panMode` prop, defaulting to `"friction"`.
   - Pass it through to `<ResumableZoom panMode={panMode} ...>`.

2. **Enable always-on pan for the preview screen**

   In `lib/components/atoms/ZoomableImage.tsx`:
   - Add an optional `allowPanAtMinScale` prop (default `false`).
   - When `allowPanAtMinScale` is `true`, keep `panEnabled={true}` at all times (skip the `setPanEnabled(false)` in `handleGestureEnd`).
   - In `features/recipe-preview/components/RecipeViewScreen.tsx`, pass `allowPanAtMinScale={true}` to `ZoomableImage`. This lets the user pull the image down at any zoom level; with `panMode="friction"` it will rubber-band back.
   - Do **not** enable this on the edit screen, because the `ScrollView` needs to capture vertical gestures when not zoomed.

3. **Offset the image for the notch on the preview screen**

   In `features/recipe-preview/components/RecipeViewScreen.tsx`:
   - Import `useSafeAreaInsets` from `react-native-safe-area-context`.
   - Get `const insets = useSafeAreaInsets()`.
   - Wrap the `ProgressiveImage` in a `View` with `paddingTop: insets.top`. This shifts the image content down so it starts below the notch at rest.
   - Increase the `coverSize` height by `insets.top` (or compute the cover size using `height - insets.top` as the container height) so the image still fills the visible area below the notch.
   - The zoom toolkit's bounds calculation will now naturally give more upward pan travel because the child content is taller relative to the root.

4. **Adjust MetadataOverlay for safe area**

   In `features/recipe-preview/components/MetadataOverlay.tsx`:
   - Import `useSafeAreaInsets`.
   - Replace the hardcoded `paddingTop: 80` with `paddingTop: insets.top + 24` (or a similar calculation that accounts for the actual notch height). This ensures the title text doesn't render behind the notch.

5. **Handle the edit screen**

   In `features/recipe-form/components/EditRecipeForm.tsx`:
   - The image is in a square container inside a `ScrollView`, so the notch issue is less severe (the user can scroll to bring the image into view).
   - Simply adding `panMode="friction"` via the ZoomableImage default is sufficient — when zoomed into the image, the user can over-pan to see the top edge.
   - No additional safe area offset is needed since the ScrollView already handles positioning.

## Testing

- **Device with notch/Dynamic Island** (iPhone 14+, or Simulator): Open a recipe with a tall photo in preview. Zoom in and try to pan upward to see the very top of the image. Verify the rubber-band effect lets you peek at the top edge, and that the image springs back when released.
- **Preview screen at rest (no zoom)**: Verify the image content starts below the notch, the metadata overlay text is fully visible and not behind the notch, and the overall layout looks correct.
- **Preview screen pan at minScale**: On the preview screen without zooming, try pulling the image down. Verify it rubber-bands and snaps back.
- **Edit screen**: Open the edit form, zoom into the image, and pan upward. Verify you can see the top of the image with the friction over-pan. Verify that when not zoomed, the ScrollView still scrolls normally (pan doesn't get captured).
- **Device without notch** (iPhone SE / Simulator): Verify no regression — the preview screen should look the same as before since `insets.top` will be small (just the status bar height, ~20px).

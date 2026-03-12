---
schema: 1
id: 2
title: Enable moving the photo sideways with one finger
status: planned
created: "2026-03-09T22:50:26.761Z"
updated: "2026-03-09T22:50:26.761Z"
tags:
  - ui
  - ux
dependencies: []
---

On the recipe preview and on the edit screen.

Even when the photo isn't zoomed in!

!!! Keep the swipe right gesture as a back button !!!

## Implementation Plan

Now I have a thorough understanding of the codebase. Here's the plan:

## Relevant Files

- **`lib/components/atoms/ZoomableImage.tsx`** — Wrapper around `ResumableZoom` from `react-native-zoom-toolkit`. Currently disables panning at scale 1 via `panEnabled` state that only becomes `true` after a pinch gesture.
- **`features/recipe-preview/components/RecipeViewScreen.tsx`** — Full-screen recipe preview. Uses `ZoomableImage` with cover-sized image that overflows horizontally for most photos.
- **`features/recipe-form/components/EditRecipeForm.tsx`** — Edit screen with square image container + scrollable form. Uses `ZoomableImage` with `maxScale={3}`.
- **`lib/hooks/useCoverSize.ts`** / **`lib/hooks/useImageCoverSize.ts`** — Calculate cover-fit dimensions. The cover-sized image is typically wider than its container (since modern phone screens are narrower than most photo aspect ratios), creating horizontal overflow that's currently hidden and inaccessible.

## Analysis

**Current behavior**: `ZoomableImage` manages a `panEnabled` state that starts `false`. It only becomes `true` after a pinch gesture starts. When the zoom returns to minScale (1), `panEnabled` is set back to `false`. This means at scale 1, the pan gesture is disabled — the user cannot move the image at all despite the cover-sized image overflowing its container.

**Why panning at scale 1 already works inside ResumableZoom** (just needs to be enabled): The library's bounds function is:
```js
boundX = Math.max(0, childSize.width * scale - rootSize.width) / 2
```
It measures actual child dimensions via `onLayout`. At scale 1, a cover-sized image (e.g., 1266px wide in a 390px container) gives `boundX = 438` — plenty of room to pan. The library just needs `panEnabled={true}`.

**Swipe-back preservation**: ResumableZoom has an `onSwipe` callback that fires when the user performs a fast swipe while at the pan boundary. For a right swipe (`onSwipe('right')`), this triggers when `translate.x === boundX` (image panned fully right, showing leftmost content). For images with no horizontal overflow, `boundX = 0` so any right swipe triggers immediately. This naturally replicates the "swipe right to go back" behavior — it fires at the edge, exactly like a scroll view's bounce-to-go-back pattern.

## Steps

1. **Modify `ZoomableImage.tsx`**:
   - Remove `const [panEnabled, setPanEnabled] = useState(false)` 
   - Remove `setPanEnabled(true)` from `handlePinchStart`
   - Remove `setPanEnabled(false)` / `setPanEnabled(true)` from `handleGestureEnd`
   - Pass `panEnabled={true}` (hardcoded) to `ResumableZoom`
   - Add optional `onSwipe?: (direction: SwipeDirection) => void` prop
   - Forward `onSwipe` to `ResumableZoom`
   - Keep all `onZoomChange` callbacks unchanged (they track scale for overlay visibility, not pan state)

2. **Modify `RecipeViewScreen.tsx`**:
   - Add a `handleSwipe` callback: if direction is `'right'`, call `router.back()`
   - Pass `onSwipe={handleSwipe}` to `ZoomableImage`

3. **No changes needed to `EditRecipeForm.tsx`**:
   - The `ZoomableImage` changes apply automatically (pan enabled at scale 1)
   - `scrollEnabled={!isZoomed}` stays — the image area becomes a dedicated pan/zoom zone, form area remains scrollable
   - No `onSwipe` needed here (explicit back/discard buttons exist, native edge-swipe still available)

## Testing

1. **Preview screen — landscape photo**: Open a recipe with a landscape/wide photo. Without zooming, swipe left/right with one finger — the photo should slide horizontally, revealing clipped edges. Verify the pan is bounded (can't overscroll).
2. **Preview screen — swipe back**: Pan the photo to its rightmost position (showing leftmost content), then perform a quick right swipe — should navigate back. Also test with a photo that fits exactly (no overflow) — right swipe should immediately go back.
3. **Preview screen — zoom still works**: Pinch to zoom, verify panning while zoomed works as before. Double-tap to reset. Verify metadata overlay fades in/out correctly based on zoom state.
4. **Edit screen — horizontal pan**: On the edit screen, touch the photo and swipe horizontally — should pan the image. Swipe vertically on the form area below — should scroll normally.
5. **Edit screen — scroll from image area**: Touch the image and swipe vertically — the image shouldn't move vertically (vertical bounds = 0 for typical photos), and the form scroll is inactive in the image zone. This is expected new behavior.
6. **Native back gesture**: On both screens, test the iOS edge swipe (from the very left edge of the screen) — should still trigger native back navigation.

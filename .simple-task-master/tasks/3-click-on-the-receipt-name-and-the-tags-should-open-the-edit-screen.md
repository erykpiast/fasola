---
schema: 1
id: 3
title: Click on the receipt name and the tags should open the edit screen.
status: planned
created: "2026-03-09T22:51:07.174Z"
updated: "2026-03-09T22:51:07.174Z"
tags:
  - ui
  - ux
dependencies: []
---

It's just more natural for the user and currently clicking there does do anything.

## Implementation Plan

## Relevant Files

- **`features/recipe-preview/components/MetadataOverlay.tsx`** — Displays recipe title, source, and tags as plain `Text` with no press handlers
- **`features/recipe-preview/components/RecipeViewScreen.tsx`** — Recipe detail screen; wraps `MetadataOverlay` in a `View` with `pointerEvents="none"`, making it completely non-interactive
- **`app/recipe/[id]/edit.tsx`** — Edit screen route (already exists)
- **`features/recipe-form/components/EditRecipeForm.tsx`** — Edit form (already exists)

## Analysis

In `RecipeViewScreen.tsx` (line 95), the `MetadataOverlay` sits inside a `<View pointerEvents="none">` wrapper. This deliberately prevents the overlay from intercepting touches meant for the `ZoomableImage` underneath. The actionable buttons (Back, Delete, Edit) are placed *outside* this wrapper so they remain tappable.

The result: tapping the recipe title or tags does nothing. The task asks that tapping these elements navigates to the edit screen, which already exists at `/recipe/${id}/edit` and is already wired to the Edit button's `handleEdit` callback.

## Steps

1. **Move `MetadataOverlay` out of the non-interactive wrapper** in `RecipeViewScreen.tsx`

   Currently (lines 95–99):
   ```tsx
   <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
     <MetadataOverlay metadata={recipe.metadata} />
     {isProcessing && <ProcessingIndicator />}
     <DebugVisualization />
   </View>
   ```
   
   Move `MetadataOverlay` above this `View` so it lives directly inside the `Animated.View` (which uses `pointerEvents="box-none"`). Keep `ProcessingIndicator` and `DebugVisualization` in the non-interactive wrapper. The `MetadataOverlay` should be positioned absolutely at the top, so ordering it before the non-interactive `View` is fine — the gradient overlay will still render in the same place.

2. **Add an `onPress` prop to `MetadataOverlay`** in `MetadataOverlay.tsx`

   - Accept an optional `onPress?: () => void` prop alongside `metadata`
   - Accept a `disabled?: boolean` prop to prevent navigation while processing
   - Wrap the `LinearGradient` content (title + source + tags area) in a `Pressable` from `react-native`
   - Only the text content area should be pressable, not the entire gradient (to avoid blocking image interactions on the transparent part)
   - Apply `hitSlop` or generous padding so the tap target is comfortable
   - Add a subtle opacity feedback on press (`({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]`)

3. **Wire `onPress` to `handleEdit`** in `RecipeViewScreen.tsx`

   Pass `onPress={handleEdit}` and `disabled={!isReady}` to the `MetadataOverlay`:
   ```tsx
   <MetadataOverlay
     metadata={recipe.metadata}
     onPress={handleEdit}
     disabled={!isReady}
   />
   ```

4. **Ensure touch passthrough remains correct**

   The `MetadataOverlay`'s `LinearGradient` uses `position: "absolute"` with large padding. To avoid blocking swipe/pinch gestures on the image below, wrap only the *text content* (title, source, tags container) in the `Pressable`, not the entire gradient. The gradient itself should keep `pointerEvents="box-none"` so touches on the transparent area pass through to the `ZoomableImage`.

## Testing

- **Tap recipe title** on the detail screen → should navigate to the edit screen
- **Tap tags** on the detail screen → should navigate to the edit screen
- **Tap while processing** (recipe not "ready") → should do nothing (disabled state)
- **Pinch-to-zoom** on the image → should still work; the metadata overlay fades out and doesn't block gestures
- **Tap transparent area** of the gradient (below the text) → should pass through to the zoomable image, not trigger edit
- **Edit button** → should still work as before

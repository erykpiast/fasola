# Image Zoom — Implementation Plan

## Context

Users need to inspect image details on imported recipe photos (verify OCR results, read page numbers). The current `RecipeImageDisplay` renders a static `expo-image` with `contentFit="cover"` and no interactivity. Zoom must be added to both the recipe view screen and the edit screen.

## Library

**`@likashefqet/react-native-image-zoom`** — provides a `Zoomable` wrapper component that supports pinch, pan, and double-tap. Peer deps (`react-native-gesture-handler >=2.x`, `react-native-reanimated >=2.x`) are satisfied by the project's existing v2.28.0 and v4.1.3. Wraps arbitrary children, so it composes directly with `expo-image`.

Web desktop: gesture-handler translates to pointer events on web, so trackpad pinch works. Scroll-wheel zoom is not natively supported; can be added later via a `.web.tsx` platform file if needed.

## Changes

### 1. Install dependency
```
pnpm add @likashefqet/react-native-image-zoom
```

### 2. Add `GestureHandlerRootView` wrapper
**File:** `app/_layout.tsx`

Wrap the outermost `<Suspense>` with `<GestureHandlerRootView style={{ flex: 1 }}>`. Required for gesture-handler v2's `GestureDetector` used internally by the zoom library.

### 3. Add `contentFit` prop to `RecipeImageDisplay`
**File:** `lib/components/atoms/RecipeImageDisplay.tsx`

Add optional `contentFit` prop (default `"cover"`). The zoomable screens will pass `"contain"` so the full image is visible before zooming. Thumbnails in the recipe grid keep `"cover"`.

### 4. Create `ZoomableImage` component
**File:** `lib/components/atoms/ZoomableImage.tsx` (new)

Wraps children in `Zoomable` from the library. Props: `children`, `style`, `onZoomChange?: (isZoomed: boolean) => void`, `minScale`, `maxScale`, `doubleTapScale`. Fires `onZoomChange(true)` on `onInteractionStart` and `onZoomChange(false)` on `onResetAnimationEnd`.

### 5. Integrate into `RecipeViewScreen`
**File:** `features/recipe-preview/components/RecipeViewScreen.tsx`

- Wrap `RecipeImageDisplay` in `ZoomableImage`.
- Pass `contentFit="contain"` to `RecipeImageDisplay`.
- Track `isZoomed` state.
- Fade out overlays (MetadataOverlay, buttons) when zoomed using reanimated `useAnimatedStyle` + opacity transition. Set `pointerEvents="none"` on the overlay container when zoomed.

### 6. Integrate into `EditRecipeForm`
**File:** `features/recipe-form/components/EditRecipeForm.tsx`

- Wrap the image area in `ZoomableImage`.
- Pass `contentFit="contain"` to `RecipeImageDisplay`.
- Track `isZoomed` state.
- Set `scrollEnabled={!isZoomed}` on the parent `ScrollView` to prevent gesture conflict.
- Use lower `maxScale` (3) and `doubleTapScale` (2) since the image area is smaller.

### 7. DebugVisualization
No changes. It renders inside `RecipeImageDisplay` and will zoom with the image. Acceptable since it's a developer-only feature and its modal renders in a separate layer.

## Verification

1. Run `pnpm start` and open on iOS Simulator
2. Navigate to a recipe view — pinch to zoom, double-tap to zoom/reset, pan while zoomed
3. Verify overlays fade out during zoom and return on reset
4. Navigate to recipe edit — pinch to zoom on the image, verify ScrollView stops scrolling during zoom
5. Verify recipe grid thumbnails remain unchanged (no zoom, `cover` fit)
6. Test on web: trackpad pinch should zoom, double-click should toggle zoom

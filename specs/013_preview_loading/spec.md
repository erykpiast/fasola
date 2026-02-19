# Progressive Image Loading for Recipe Preview

**Status:** Draft
**Author:** Claude / 2026-02-19

## Overview

Replace the current instant-swap image load in the recipe preview screen with a progressive loading sequence: display a blurred thumbnail immediately, load the full-resolution image behind it, then crossfade.

## Problem Statement

The preview screen renders a single 3000px-wide image via `RecipeImageDisplay`. On navigation, there is a visible delay while the full image decodes and renders. During this gap the user sees either a black screen which feel sluggish.

Every recipe now carries a `thumbnailUri` (400px longest edge, ~20-40 KB JPEG) alongside `photoUri`. This thumbnail loads nearly instantly and can serve as a perceptual placeholder while the heavy image streams in.

## Goals

- Eliminate the perceived loading gap when opening a recipe preview.
- Show a blurred thumbnail within the first frame of the preview screen.
- Crossfade from thumbnail to full image over ~500 ms once the full image is ready.
- Preserve all existing zoom, overlay, and navigation behavior unchanged.

## Non-Goals

- Making the thumbnail zoomable (it is visible for a fraction of a second).
- Generating blurhash/thumbhash strings — the existing file-based thumbnail is sufficient.
- Changing the edit screen (`EditRecipeForm`). It can adopt this pattern later if needed.
- Preloading or caching the full image before navigation occurs.
- Changing thumbnail dimensions or quality.

## Technical Dependencies

| Dependency | Version | Role |
|---|---|---|
| `expo-image` | 3.0.9 | `Image` component with `blurRadius`, `onLoad` |
| `react-native-reanimated` | 4.1.3 | `withTiming` opacity animation |

No new packages required.

## Detailed Design

### Approach: Two-Layer Stack

A single `expo-image` `Image` with its built-in `placeholder` prop cannot apply `blurRadius` to the placeholder (the docs state: "This effect is not applied to placeholders"). To get an explicit blur on the thumbnail we use two stacked `Image` components with a Reanimated opacity animation.

```
┌─────────────────────────────┐
│  ZoomableImage (existing)   │
│  ┌───────────────────────┐  │
│  │ Full Image (bottom)   │  │  ← source={recipe.photoUri}, loads async
│  │ contentFit="cover"    │  │
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │ Thumbnail (top)       │  │  ← source={recipe.thumbnailUri}, loads instantly
│  │ blurRadius={4}        │  │     absolute-positioned over full image
│  │ Animated opacity      │  │     fades to 0 when full image ready
│  └───────────────────────┘  │
└─────────────────────────────┘
```

### Loading Sequence

1. **Frame 0:** `RecipeViewScreen` mounts. Both `Image` components render. The thumbnail (~30 KB) decodes in under one frame. The full image begins loading.
2. **While loading:** The thumbnail is visible at full viewport size with `blurRadius={4}` to soften the upscaling artifacts. The full image is behind it, invisible.
3. **Full image ready:** `onLoad` fires on the bottom `Image`. A shared value flips, triggering `withTiming` to animate the thumbnail's opacity from 1 to 0 over 500 ms.
4. **After transition:** The thumbnail layer is visually gone. The full image is now fully visible and zoomable.

### New Component: `ProgressiveImage`

Create `lib/components/atoms/ProgressiveImage.tsx`.

```typescript
import { Image } from "expo-image";
import { type JSX, useCallback } from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { ImageUri } from "@/lib/types/primitives";

const AnimatedExpoImage = Animated.createAnimatedComponent(Image);

const BLUR_RADIUS = 4;
const FADE_DURATION_MS = 500;

export function ProgressiveImage({
  uri,
  thumbnailUri,
  style,
  contentFit = "cover",
}: {
  uri: ImageUri;
  thumbnailUri: ImageUri | undefined;
  style?: ViewStyle;
  contentFit?: "cover" | "contain";
}): JSX.Element {
  const thumbnailOpacity = useSharedValue(thumbnailUri ? 1 : 0);

  const handleFullImageLoad = useCallback((): void => {
    thumbnailOpacity.value = withTiming(0, { duration: FADE_DURATION_MS });
  }, [thumbnailOpacity]);

  const thumbnailStyle = useAnimatedStyle(() => ({
    opacity: thumbnailOpacity.value,
  }));

  return (
    <>
      <Image
        source={{ uri }}
        style={[styles.image, style]}
        contentFit={contentFit}
        onLoad={handleFullImageLoad}
      />
      {thumbnailUri && (
        <AnimatedExpoImage
          source={{ uri: thumbnailUri }}
          style={[styles.image, styles.thumbnailOverlay, style, thumbnailStyle]}
          contentFit={contentFit}
          blurRadius={BLUR_RADIUS}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  image: {
    width: "100%",
    height: "100%",
  },
  thumbnailOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
```

### Changes to RecipeViewScreen

Replace `RecipeImageDisplay` with `ProgressiveImage` inside the `ZoomableImage` wrapper:

```diff
- <RecipeImageDisplay
-   uri={recipe.photoUri}
-   style={{ width, height }}
- />
+ <ProgressiveImage
+   uri={recipe.photoUri}
+   thumbnailUri={recipe.thumbnailUri}
+   style={{ width, height }}
+ />
```

No other changes to `RecipeViewScreen`. The `ZoomableImage` wrapper, overlay animations, and navigation buttons remain untouched.

### Fallback Behavior

When `thumbnailUri` is `undefined` (recipes imported before thumbnails were added, or thumbnail generation failed), the component skips the thumbnail layer entirely and behaves identically to the current implementation — a single full-image load with no transition.

### File Organization

| File | Action |
|---|---|
| `lib/components/atoms/ProgressiveImage.tsx` | **New** |
| `features/recipe-preview/components/RecipeViewScreen.tsx` | Modify — swap `RecipeImageDisplay` for `ProgressiveImage` |

`RecipeImageDisplay` remains unchanged and continues to be used by the grid, edit screen, and any other consumer.

## User Experience

- Opening a recipe preview: the thumbnail appears immediately (blurred), then the sharp full image fades in. The transition is subtle and quick enough that users perceive an instant, smooth load rather than a pop-in.
- Recipes without a thumbnail: behavior is unchanged from today.
- Zoom interaction: unaffected. The thumbnail is gone by the time the user would pinch.

## Testing Strategy

### Unit Tests

- `ProgressiveImage` renders with both `uri` and `thumbnailUri` — verify two `Image` elements are in the tree.
- `ProgressiveImage` renders with `uri` only (no `thumbnailUri`) — verify only one `Image` element.
- `onLoad` callback on the full image triggers the opacity animation (mock Reanimated shared value).

### Manual Tests

- Navigate to recipe preview on a device with network-speed-equivalent large images. Confirm the blurred thumbnail is visible before the full image.
- Confirm the crossfade is smooth (~500 ms).
- Confirm zoom still works after the full image appears.
- Confirm overlay (metadata, buttons) is unaffected.
- Test with a recipe that has no `thumbnailUri` — should load identically to the old behavior.

## Performance Considerations

- **Memory:** Two images are briefly in memory simultaneously during the 500 ms fade. Peak is one 400px JPEG + one 3000px JPEG. Acceptable on any modern device.
- **Decode time:** The thumbnail decodes in <1 frame due to small size. The full image decode time is unchanged from today — the difference is that the user now sees something useful during that decode.
- **After transition:** The thumbnail layer's opacity is 0. React Native keeps the view in the tree but rendering cost is negligible. If profiling shows otherwise, a state flag can unmount the thumbnail after the animation completes.

## Security Considerations

No new attack surface. All image URIs come from the existing local storage layer.

## Documentation

No external documentation changes required. The architecture doc does not catalog individual atoms.

## Implementation Phases

### Phase 1: Core

1. Create `ProgressiveImage` component.
2. Integrate into `RecipeViewScreen`.
3. Manual verification on iOS and Android.

### Phase 2 (optional, later)

- Apply the same pattern to `EditRecipeForm` if its load time is also perceived as slow.
- Tune `BLUR_RADIUS` and `FADE_DURATION_MS` based on user feedback.
- Unmount the thumbnail `Image` after the fade completes if memory profiling warrants it.

## Open Questions

1. **Blur radius value:** `4` is a starting point. May need tuning on physical devices where the 400px→3000px upscale ratio makes pixelation more or less visible.
2. **`Animated.createAnimatedComponent(Image)` compatibility:** Expo Image wraps a native view; Reanimated's `createAnimatedComponent` should handle it, but this needs verification. If it doesn't work, the fallback is wrapping the thumbnail `Image` in an `Animated.View` with the opacity style.

## References

- [expo-image API](https://docs.expo.dev/versions/latest/sdk/image/) — `blurRadius`, `onLoad`, `contentFit`
- `specs/012_thumbnails/` — thumbnail generation and storage
- `specs/011_image_zoom/` — `ZoomableImage` component
- `features/recipe-preview/components/RecipeViewScreen.tsx` — current preview implementation

# Task Breakdown: Progressive Image Loading for Recipe Preview

Generated: 2026-02-19
Source: specs/013_preview_loading/spec.md

## Overview

Two-task implementation: create a `ProgressiveImage` atom that layers a blurred thumbnail over a loading full-size image with a crossfade animation, then wire it into `RecipeViewScreen`.

---

## Phase 1: Core

### Task 1: Create `ProgressiveImage` component

**Description**: New atom that renders two stacked expo-image `Image` components — full image underneath, blurred thumbnail on top — with a Reanimated opacity fade triggered by the full image's `onLoad`.
**Size**: Small
**Priority**: High
**Dependencies**: None

**File**: `lib/components/atoms/ProgressiveImage.tsx` (new)

**Implementation**:

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

**Key decisions**:
- `Animated.createAnimatedComponent(Image)` wraps expo-image's `Image` for direct opacity animation on the thumbnail. If this fails at runtime, fallback: wrap thumbnail `Image` in `Animated.View` with the opacity style instead.
- `onLoad` (not `onLoadEnd`) — only fires on successful decode, so the thumbnail stays visible if the full image fails.
- Fragment `<>` return — no extra wrapper View. Both images position relative to the `Zoomable` ancestor.
- `blurRadius={4}` softens the 400px→viewport upscale. Tunable constant.
- When `thumbnailUri` is undefined, no thumbnail layer renders and shared value starts at 0 — identical to current behavior.

**Acceptance criteria**:
- [ ] Component renders two `Image` elements when `thumbnailUri` is provided
- [ ] Component renders one `Image` element when `thumbnailUri` is undefined
- [ ] Thumbnail has `blurRadius={4}` and is absolute-positioned over full image
- [ ] `onLoad` on full image triggers 500ms opacity fade on thumbnail
- [ ] Follows project conventions: explicit return type, `@/` imports, semantic type aliases, inline props

---

### Task 2: Integrate into RecipeViewScreen

**Description**: Replace `RecipeImageDisplay` with `ProgressiveImage` in the preview screen, passing both `photoUri` and `thumbnailUri` from the recipe.
**Size**: Small
**Priority**: High
**Dependencies**: Task 1

**File**: `features/recipe-preview/components/RecipeViewScreen.tsx` (modify)

**Changes**:

1. Replace import:
```diff
- import { RecipeImageDisplay } from "@/lib/components/atoms/RecipeImageDisplay";
+ import { ProgressiveImage } from "@/lib/components/atoms/ProgressiveImage";
```

2. Replace usage inside `ZoomableImage`:
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

No other changes. `ZoomableImage` wrapper, overlay animations, navigation buttons, and zoom state management remain untouched.

**Acceptance criteria**:
- [ ] Preview screen shows blurred thumbnail immediately on navigation
- [ ] Full image fades in over ~500ms once loaded
- [ ] Zoom (pinch, double-tap, pan) works after full image appears
- [ ] Metadata overlay and buttons are unaffected
- [ ] Recipes without `thumbnailUri` display identically to previous behavior
- [ ] No regressions on iOS, Android, or web

---

## Summary

| Metric | Value |
|---|---|
| Total tasks | 2 |
| New files | 1 (`ProgressiveImage.tsx`) |
| Modified files | 1 (`RecipeViewScreen.tsx`) |
| New dependencies | 0 |
| Parallel opportunities | None (Task 2 depends on Task 1) |

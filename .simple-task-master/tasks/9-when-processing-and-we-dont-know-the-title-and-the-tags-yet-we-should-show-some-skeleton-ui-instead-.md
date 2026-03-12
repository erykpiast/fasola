---
schema: 1
id: 9
title: When processing and we don't know the title and the tags yet, we should show some skeleton UI instead of the title and the tags
status: planned
created: "2026-03-12T22:06:19.652Z"
updated: "2026-03-12T22:06:19.652Z"
tags:
  - ux
dependencies: []
---

## Implementation Plan

## Relevant Files

- **`features/recipe-preview/components/MetadataOverlay.tsx`** — Currently returns `null` when no title/source/tags exist (i.e., during processing). This is the primary file to modify.
- **`features/recipe-preview/components/RecipeViewScreen.tsx`** — Passes `metadata` and `disabled` to `MetadataOverlay`; needs to also pass processing state so the overlay knows to show skeletons.
- **`lib/components/atoms/SkeletonBlock.tsx`** — New file: a reusable animated shimmer/pulse placeholder block.
- **`features/recipe-preview/components/ProcessingIndicator.tsx`** — Reference for existing animation patterns (uses RN `Animated`). The skeleton will coexist with this centered spinner.
- **`lib/types/recipe.ts`** — Recipe type definitions; no changes needed but important context (`status`, `metadata.title`, `metadata.tagIds`).
- **`AGENTS.md`** — Code style rules (explicit return types, `Array<T>`, path aliases, inline props, memoization).

## Analysis

**Current behavior:** When a recipe is processing, `metadata.title` is `undefined` and `metadata.tagIds` is empty. `MetadataOverlay` checks `hasTitle && hasSource && hasTags` — all false — and returns `null`. The user sees only the `ProcessingIndicator` spinner in the center with rotating messages, but the top area where title/tags would appear is empty.

**Desired behavior:** While processing (status is `"pending"` or `"processing"`), the overlay should show animated skeleton placeholders in the same position and approximate size as the title and tag text would occupy. Once processing completes and real metadata arrives, the skeletons are replaced by actual content. If processing finishes with no metadata (edge case), the overlay returns to `null`.

**Key design decisions:**
- Use a pulsing opacity animation (reanimated `withRepeat` + `withSequence`) for the skeleton — lightweight and consistent with the app's animation stack.
- Skeleton blocks are semi-transparent white rounded rectangles matching the approximate dimensions of title text (~60% width, 24px height) and tag pills (~40% width, 14px height).
- The gradient background should still render during skeleton state so the skeletons are visible against the photo.

## Steps

1. **Create `lib/components/atoms/SkeletonBlock.tsx`** — A reusable animated skeleton component:
   - Props: `width: DimensionValue`, `height: number`, `style?: ViewStyle` (all inline)
   - Uses `react-native-reanimated`: `useSharedValue`, `useAnimatedStyle`, `withRepeat`, `withSequence`, `withTiming`
   - Animates opacity between 0.15 and 0.4 on a ~1s loop
   - Renders an `Animated.View` with `backgroundColor: "rgba(255,255,255,0.3)"`, `borderRadius: 4`

2. **Modify `MetadataOverlay.tsx`** — Add an `isProcessing` prop and skeleton rendering:
   - Add `isProcessing?: boolean` to the inline props
   - Change the early-return logic: if `!hasTitle && !hasSource && !hasTags && !isProcessing`, return `null`
   - When `isProcessing` and metadata is missing, render skeleton blocks inside the existing `LinearGradient` + `Pressable` structure:
     - Title skeleton: `<SkeletonBlock width="65%" height={24} />` with `marginBottom: 4`
     - A shorter second title line: `<SkeletonBlock width="40%" height={24} />` with `marginBottom: 8`
     - Tags skeleton: `<SkeletonBlock width="50%" height={14} />`
   - When real metadata exists (even during processing), show real content instead of skeletons — this handles the case where partial metadata may arrive
   - Disable press interaction during processing (already handled by `disabled` prop)

3. **Update `RecipeViewScreen.tsx`** — Pass `isProcessing` to `MetadataOverlay`:
   - The `isProcessing` boolean already exists on line 85-86
   - Add `isProcessing={isProcessing}` to the `<MetadataOverlay>` call on line 107-111

## Testing

1. **Import a new recipe photo** and immediately open the recipe detail view — the skeleton blocks should pulse in the title/tags area while the `ProcessingIndicator` spinner is also visible in the center
2. **Wait for processing to complete** — skeletons should disappear and be replaced by the extracted title and tags with no layout jump
3. **Open a fully processed recipe** — no skeletons should appear; normal title/tags display as before
4. **Edge case: recipe with no extractable metadata** — after processing completes with empty metadata, the overlay should return to `null` (no lingering skeletons)
5. **Zoom interaction** — the skeleton overlay should fade out when zooming, same as the metadata overlay does (handled by the parent `Animated.View` with `overlayStyle`)

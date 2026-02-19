# Fix: Recipe Grid Status Bar Overlap

**Status:** Ready
**Author:** Claude Code, 2026-02-20

## Overview

Add top content inset to the recipe grid on the home screen so the first row of images is not obscured by the iOS status bar (clock, battery, signal indicators) at rest position.

## Problem Statement

The `RecipeGrid` FlashList in `app/index.tsx` renders edge-to-edge with no top padding. The navigation stack has `headerShown: false`, and neither the screen container nor the list applies safe area insets. The first row of recipe thumbnails sits directly behind the status bar.

## Goals

- First row of images visible below the status bar when the list is at its default scroll position
- Black space (matching the background) fills the gap between the top of the screen and the first row
- When scrolled, images naturally travel behind the status bar — no clipping or blocking required

## Non-Goals

- Adding a navigation header or toolbar
- Changing the status bar style, color, or translucency
- Modifying the bottom inset or search bar positioning
- Handling landscape orientation or iPad split-view insets

## Technical Dependencies

- `react-native-safe-area-context` (already installed, v5.6.1)

## Detailed Design

### Approach

Add `paddingTop` equal to `useSafeAreaInsets().top` to the FlashList's `contentContainerStyle` in `RecipeGrid.tsx`.

`contentContainerStyle` padding scrolls with the content, which produces the exact behavior requested: space at rest, images scroll behind the status bar when the user scrolls up.

### Changed File

**`features/recipes-list/components/RecipeGrid.tsx`**

1. Import `useSafeAreaInsets` from `react-native-safe-area-context`
2. Call `useSafeAreaInsets()` inside `RecipeGrid`
3. Apply `paddingTop: insets.top` to `contentContainerStyle` via a `useMemo` combining the static styles with the dynamic inset value

```tsx
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function RecipeGrid({ recipes, onRecipeTap }: { ... }): JSX.Element {
  const insets = useSafeAreaInsets();

  // ... existing callbacks ...

  return (
    <FlashList
      data={recipes}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      numColumns={COLUMNS}
      contentContainerStyle={{ ...styles.container, paddingTop: insets.top }}
      showsVerticalScrollIndicator={false}
    />
  );
}
```

No changes to `app/index.tsx` or any other file.

### Why not `contentInsetAdjustmentBehavior`

`contentInsetAdjustmentBehavior="automatic"` adjusts native `UIScrollView` content insets and keeps the scroll indicator aligned, but FlashList's support for this prop is inconsistent and the visual result (content inset vs. content padding) is harder to predict. Explicit `paddingTop` is simpler, deterministic, and achieves the stated goal.

### Why not `SafeAreaView` wrapper

Wrapping the list in `SafeAreaView` would prevent images from ever scrolling behind the status bar, contradicting the requirement that scrolled content may overlap it.

## User Experience

Before: first row of thumbnails partially hidden behind the clock/battery area.
After: black gap equal to the status bar height above the first row at rest. Scrolling up moves thumbnails behind the status bar naturally.

## Testing Strategy

- Manual verification on a physical device or simulator with notch/Dynamic Island (iPhone 14 Pro, 15, 16 etc.)
- Confirm the gap matches the status bar height
- Confirm scrolling moves content behind the status bar
- Confirm the empty state (`EmptyState` component) is unaffected (it renders in place of the grid, not inside it — may need separate treatment if it also overlaps, but that is out of scope for this fix)

## Performance Considerations

None. `useSafeAreaInsets` is a synchronous context read. Spreading one additional style property has no measurable cost.

## Security Considerations

None.

## Documentation

No documentation changes required.

## Implementation Phases

Single-phase change. One file, one prop modification.

## Open Questions

- Should the `EmptyState` component (shown when `recipes.length === 0`) also respect the top safe area inset? Currently out of scope but worth noting.

## Implementation Notes

- Memoize the merged `contentContainerStyle` with `useMemo` keyed on `insets.top`. FlashList is sensitive to reference stability on this prop; a new object every render may trigger unnecessary layout recalculations.
- The `EmptyState` component (zero recipes) renders in place of the grid and has the same status bar overlap. Address it in the same change or immediately after.

## References

- `features/recipes-list/components/RecipeGrid.tsx` — target file
- `app/index.tsx` — parent screen (no changes needed)
- `lib/components/atoms/CloseButton.tsx` — existing pattern using `useSafeAreaInsets` in this codebase

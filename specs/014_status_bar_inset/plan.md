# Task Breakdown: Fix Recipe Grid Status Bar Overlap

Generated: 2026-02-20
Source: specs/014_status_bar_inset/spec.md

## Overview

Add `paddingTop` using safe area insets to the recipe grid's FlashList so the first row of images sits below the status bar at rest.

## Phase 1: Implementation

### Task 1.1: Add top safe area padding to RecipeGrid

**Description**: Apply `paddingTop: insets.top` to the FlashList `contentContainerStyle` in `RecipeGrid.tsx`, memoized for reference stability.
**Size**: Small
**Priority**: High
**Dependencies**: None

**Changed File**: `features/recipes-list/components/RecipeGrid.tsx`

**Implementation**:

1. Import `useSafeAreaInsets` from `react-native-safe-area-context`
2. Import `useMemo` from `react`
3. Call `const insets = useSafeAreaInsets()` inside `RecipeGrid`
4. Create a memoized content container style combining the existing `styles.container` with `paddingTop: insets.top`
5. Pass the memoized style to FlashList's `contentContainerStyle`

```tsx
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMemo } from "react";

export function RecipeGrid({
  recipes,
  onRecipeTap,
}: {
  recipes: Array<Recipe>;
  onRecipeTap?: (id: RecipeId) => void;
}): JSX.Element {
  const insets = useSafeAreaInsets();

  const contentContainerStyle = useMemo(
    () => ({ ...styles.container, paddingTop: insets.top }),
    [insets.top],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Recipe>) => (
      <RecipeItem recipe={item} onTap={onRecipeTap} />
    ),
    [onRecipeTap],
  );

  const keyExtractor = useCallback((item: Recipe) => item.id, []);

  return (
    <FlashList
      data={recipes}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      numColumns={COLUMNS}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={false}
    />
  );
}
```

**Acceptance Criteria**:
- [ ] First row of images visible below status bar at default scroll position
- [ ] Black gap (matching background) between screen top and first row
- [ ] Scrolling up moves images behind the status bar naturally
- [ ] `contentContainerStyle` is memoized (not a new object each render)
- [ ] Existing `paddingBottom: 120` from `styles.container` preserved
- [ ] Manual verification on simulator with notch/Dynamic Island device

## Summary

| Metric | Value |
|--------|-------|
| Total tasks | 1 |
| Phase 1 | 1 |
| Files changed | 1 |
| Parallel opportunities | N/A |

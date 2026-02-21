# Animated Import Source Selector Transition

**Status:** Draft
**Authors:** Claude, 2026-02-20

## Overview

Animate the transition between the plus button and the import source popover as a continuous glass-surface morph: the button shrinks, its content fades, the glass shape expands from the button's position to the panel size, and the panel content fades in. The search bar independently fades/slides out. Inspired by Apple Notes' add-note button and similar iOS morphing patterns.

## Background / Problem Statement

Currently in `app/index.tsx`, the bottom bar and popover are conditionally rendered:

```tsx
{!popoverVisible && (
  <KeyboardAvoidingView ...>
    <View style={styles.bottomBar}>
      <SearchBar ... />
      <AddRecipeButton onPress={showPopover} />
    </View>
  </KeyboardAvoidingView>
)}
{popoverVisible && (
  <LiquidGlassPopover ... />
)}
```

This causes a hard cut. The popover has an internal SwiftUI spring animation (`.scale(0.5, anchor: .bottomTrailing).combined(with: .opacity)`), but the surrounding UI snaps with no transition.

The desired effect is a two-phase morph where a single glass surface transitions from the circular button shape to the rectangular panel shape:

1. **Shrink**: The button's glass circle shrinks to ~80% while the plus icon fades out
2. **Expand**: From that shrunken circle, the glass surface grows (significantly horizontally, somewhat vertically) to the panel dimensions while the panel options fade in

## Goals

- A single continuous glass surface that morphs from circle (button) to rounded rectangle (panel) and back
- Content cross-fade: plus icon fades out during shrink, option labels/icons fade in during expand
- The morph anchors at the bottom-right (where the button sits)
- The search bar independently animates out (fade + slide) via Reanimated on the RN side
- On dismiss, the full reverse animation plays
- `AddRecipeButton` remains a separate RN component (it's simply hidden while the popover owns the morphing glass surface)
- Spring-based timing, ~300-400ms total

## Non-Goals

- Android/web morph animation (web fallback remains a simple Modal; this morph is iOS-only native SwiftUI)
- Changes to the popover's option content, dismiss behavior, or haptic feedback
- Animating the search bar at the native level (Reanimated handles it from RN)

## Technical Dependencies

- `react-native-reanimated` 4.1.3 (already installed, for search bar animation)
- `liquid-glass` native module (project-local, `modules/liquid-glass/`)
- SwiftUI animation APIs (`withAnimation`, keyframe animations)
- No new external dependencies required

## Detailed Design

### Core Concept: The Popover Owns the Morph

The `LiquidGlassPopoverView` is enhanced to render the entire morph animation natively in SwiftUI. When transitioning to visible, it starts as a circle matching the button's size and position (bottom-right), shrinks, then expands to the panel. When dismissing, it reverses. The actual `AddRecipeButton` is hidden (opacity 0) while the popover is active, since the popover's collapsed state visually replaces it.

This keeps the button and popover as separate RN components. They don't know about each other. The orchestration layer in `app/index.tsx` just hides the real button and tells the popover to show.

### Native SwiftUI Changes (`LiquidGlassPopoverView.swift`)

#### New Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `buttonSize` | `CGFloat` | `48` | The collapsed circle diameter (matches the plus button) |
| `buttonSystemImage` | `String` | `"plus"` | SF Symbol shown in the collapsed state |

#### Panel Size Measurement

The current popover uses `.fixedSize()` on the options VStack to size it to content. This conflicts with the explicit `frame(width:height:)` needed for the morph animation. These cannot coexist on the same view.

Solution: a hidden measurement view. Render the options list in an invisible overlay to capture its natural size, then use that as the expanded-state animation target:

```swift
@State private var panelSize: CGSize = CGSize(width: 200, height: 100) // fallback

// Hidden measurement (in body, outside morphing container)
optionsList
    .fixedSize()
    .hidden()
    .onGeometryChange(for: CGSize.self) { proxy in
        proxy.size
    } action: { newSize in
        panelSize = newSize
    }
```

The morphing container then uses `panelSize.width` / `panelSize.height` as the expanded frame target. No `.fixedSize()` on the morphing container itself. The hidden view costs nothing visually — it participates in layout only, no drawing.

#### Animation Approach: Two-Phase Chained Springs

A single spring from `buttonSize` to `panelSize` will overshoot past `panelSize` and settle — it never goes below `buttonSize`, so it cannot produce the shrink-before-expand effect. The shrink requires the value to briefly move in the opposite direction.

Use two chained `withAnimation` calls separated by a short async delay:

```swift
@State private var expanded = false
@State private var shrinkScale: CGFloat = 1.0

// Derived animatable properties
private var currentWidth: CGFloat {
  let base = expanded ? panelSize.width : buttonSize
  return base * shrinkScale
}
private var currentHeight: CGFloat {
  let base = expanded ? panelSize.height : buttonSize
  return base * shrinkScale
}
private var currentCornerRadius: CGFloat {
  expanded ? 20 : (buttonSize * shrinkScale) / 2
}

.onChange(of: isVisible) { newValue in
  if newValue {
    // Phase 1: Shrink the button circle to 80%
    withAnimation(.spring(duration: 0.1)) {
      shrinkScale = 0.8
    }
    // Phase 2: Expand to panel size (spring retargets from wherever phase 1 is)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
      withAnimation(.spring(duration: 0.35, bounce: 0.15)) {
        expanded = true
        shrinkScale = 1.0
      }
    }
  } else {
    // Reverse: collapse to circle in one spring
    withAnimation(.spring(duration: 0.3, bounce: 0.1)) {
      expanded = false
    }
  }
}
```

The `asyncAfter` delay (80ms) is short enough to feel immediate but gives the shrink phase time to register visually. Spring retargeting handles interruptions naturally — if the user taps again mid-shrink, the second spring simply retargets from the current interpolated value.

**MVP simplification**: If the two-phase sequence proves difficult to tune, a single direct spring expand (skipping the shrink phase entirely) is an acceptable fallback. Many iOS morphing animations use a direct expand with a brief initial velocity instead of an explicit pre-shrink. Test the single-spring first; add the two-phase only if the direct expand feels too abrupt.

#### Content Layout During Morph

The ZStack contains both collapsed content (Image) and expanded content (options VStack), with opacity toggled on each. The expanded VStack participates in layout even when invisible (opacity 0), and its natural size could affect the ZStack's sizing or cause text reflow during frame interpolation.

Apply `.fixedSize()` to the inner options list inside the ZStack so it always renders at its natural size regardless of the proposed frame. The outer `.frame()` and `.clipShape()` handle the visible bounds. During the morph, the options list sits at full size but is clipped to the expanding frame — more content is revealed as the frame grows. Combined with the opacity fade-in, this produces a clean reveal effect.

```swift
@ViewBuilder
private var morphingContainer: some View {
  ZStack {
    // Collapsed content (plus icon)
    Image(systemName: buttonSystemImage)
      .font(.system(size: buttonSize / 2.8))
      .frame(width: buttonSize, height: buttonSize) // explicit size, prevents ZStack sizing influence
      .opacity(expanded ? 0 : 1)

    // Expanded content (options list)
    optionsList
      .fixedSize() // always renders at natural size, clipped by outer frame
      .opacity(expanded ? 1 : 0)
  }
  .frame(width: currentWidth, height: currentHeight)
  .clipShape(RoundedRectangle(cornerRadius: currentCornerRadius))
  // Glass effect — see section below
}
```

#### Glass Effect Strategy

On iOS 26+, `.glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius:))` takes a shape parameter. Whether this shape parameter animates smoothly per-frame or snaps on state changes is implementation-dependent and unverified.

**Primary approach**: Use `.clipShape(RoundedRectangle(cornerRadius: currentCornerRadius))` for the morph animation (this is definitively animatable), with `.background(.ultraThinMaterial)` for the glass surface. This works on both iOS 26+ and earlier versions.

**Enhancement**: After the primary approach works, test replacing `.background(.ultraThinMaterial)` with `.glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: currentCornerRadius))` on iOS 26+. If the glass effect shape animates smoothly, use it. If it snaps, keep `.ultraThinMaterial` + `.clipShape` during the morph and switch to `.glassEffect` only in the fully expanded resting state (after the animation completes).

```swift
@ViewBuilder
private var morphingContainer: some View {
  ZStack { ... }
  .frame(width: currentWidth, height: currentHeight)
  .background(.ultraThinMaterial)  // reliable, animatable via clipShape
  .clipShape(RoundedRectangle(cornerRadius: currentCornerRadius))
}
```

#### Position Alignment

The popover positions its content with:
```swift
.padding(.trailing, 28)
.padding(.bottom, geometry.safeAreaInsets.bottom + 28)
```

The RN button sits inside `bottomBar` with:
```tsx
paddingHorizontal: 28,
paddingBottom: 28,
```

The `KeyboardAvoidingView` is absolutely positioned at `bottom: 0` (the actual screen edge). The RN button ends up 28pt from the screen bottom. The popover's collapsed circle ends up `safeAreaInsets.bottom + 28` from the screen bottom. On devices with a home indicator (~34pt safe area), this creates a **34pt vertical gap** — the morph circle doesn't overlap the button.

**Fix**: Change the popover's bottom padding to match the RN layout. Remove the safe area addition:

```swift
.padding(.trailing, 28)
.padding(.bottom, 28)
```

This positions the collapsed circle at the same distance from the screen bottom as the RN button. The `.ignoresSafeArea()` on the GeometryReader already makes the view draw from the actual screen edge. The expanded panel will also shift down by `safeAreaInsets.bottom`, but since it expands upward from the anchor point, this is acceptable — the panel still sits well within the visible area.

Verify on-device that the expanded panel doesn't overlap the home indicator. If it does, the expanded state can add internal bottom padding to compensate, without affecting the collapsed circle's position.

### React Native Changes (`app/index.tsx`)

#### Touch Interception Prevention

The always-mounted popover native view uses `StyleSheet.absoluteFillObject`, creating a full-screen UIKit view. UIKit views intercept touches by default regardless of background transparency — `UIView.point(inside:with:)` returns `true` for any point within bounds. When the popover is not visible, this full-screen view blocks all taps on the grid, search bar, and button underneath.

**Fix**: Toggle `pointerEvents` on the popover wrapper based on visibility:

```tsx
<View
  style={StyleSheet.absoluteFill}
  pointerEvents={popoverVisible ? "auto" : "none"}
>
  <LiquidGlassPopover
    visible={popoverVisible}
    options={importOptions}
    buttonSize={48}
    buttonSystemImage="plus"
    onSelect={handleImportOptionSelect}
    onDismiss={dismissPopover}
  />
</View>
```

`pointerEvents="none"` causes React Native to set `userInteractionEnabled = false` on the UIKit view, making it transparent to all touches. When the popover becomes visible, `pointerEvents="auto"` re-enables interaction, and the SwiftUI backdrop handles tap-outside dismissal.

#### Search Bar Animation

The search bar gets a Reanimated animation independent of the native morph:

```tsx
const popoverProgress = useSharedValue(0);

useEffect(() => {
  popoverProgress.value = withSpring(popoverVisible ? 1 : 0, {
    damping: 20,
    stiffness: 200,
  });
}, [popoverVisible, popoverProgress]);

const searchBarStyle = useAnimatedStyle(() => ({
  opacity: 1 - popoverProgress.value,
  transform: [
    { translateX: -popoverProgress.value * 40 },
    { scale: 1 - popoverProgress.value * 0.05 },
  ],
}));
```

The search bar slides left and fades, clearing space for the expanding panel.

#### Button Visibility

The `AddRecipeButton` is hidden instantly (opacity 0) when the popover becomes visible, since the popover's collapsed morph state visually replaces the button at the same position:

```tsx
const buttonStyle = useAnimatedStyle(() => ({
  opacity: popoverProgress.value > 0.01 ? 0 : 1,
}));
```

This is a hard cut on the real button, but imperceptible because the popover's initial collapsed state (a circle of the same size at the same position) takes over seamlessly.

**Frame-level race note**: The button hide (Reanimated UI thread) and popover circle render (native bridge prop update) travel through different pipelines. In the worst case, there may be 1-2 frames (~16-33ms) where the real button is hidden but the popover hasn't rendered its collapsed circle yet. This is likely imperceptible. If testing reveals a visible flash, the mitigation is to delay the button hide by one frame using `runOnUI` scheduling, or to allow a brief overlap (both visible) rather than a gap.

#### Layout Structure

```tsx
<View style={[styles.container, { backgroundColor: colors.background }]}>
  {recipes.length === 0 ? <EmptyState /> : <RecipeGrid ... />}

  <KeyboardAvoidingView
    behavior={Platform.OS === "ios" ? "padding" : "height"}
    style={styles.keyboardAvoid}
  >
    <View style={styles.bottomBar}>
      <Animated.View style={[styles.searchBarWrapper, searchBarStyle]}>
        <SearchBar ... />
      </Animated.View>
      <Animated.View style={buttonStyle}>
        <AddRecipeButton onPress={showPopover} />
      </Animated.View>
    </View>
  </KeyboardAvoidingView>

  {/* Always mounted; pointerEvents prevents touch interception when hidden */}
  <View
    style={StyleSheet.absoluteFill}
    pointerEvents={popoverVisible ? "auto" : "none"}
  >
    <LiquidGlassPopover
      visible={popoverVisible}
      options={importOptions}
      buttonSize={48}
      buttonSystemImage="plus"
      onSelect={handleImportOptionSelect}
      onDismiss={dismissPopover}
    />
  </View>
</View>
```

### Expo Module Changes (`LiquidGlassModule.swift`)

Register the two new props:

```swift
View(LiquidGlassPopoverView.self) {
  // existing props...
  Prop("buttonSize") { (view, size: CGFloat) in
    view.setButtonSize(size)
  }
  Prop("buttonSystemImage") { (view, image: String) in
    view.setButtonSystemImage(image)
  }
  // existing events...
}
```

### TypeScript Type Changes (`LiquidGlassPopover.types.ts`)

```typescript
export type LiquidGlassPopoverProps = {
  visible: boolean;
  options: Array<LiquidGlassPopoverOption>;
  onSelect: (id: string) => void;
  onDismiss: () => void;
  buttonSize?: number;
  buttonSystemImage?: string;
  style?: ViewStyle;
};
```

New props are optional with sensible defaults, so existing usage without them still compiles and works (falls back to the current scale transition if `buttonSize` is not provided).

### File Changes

| File | Change |
|------|--------|
| `modules/liquid-glass/ios/LiquidGlassPopoverView.swift` | Replace scale+opacity transition with morph animation; add `buttonSize`/`buttonSystemImage` state; add hidden measurement view; rewrite `LiquidGlassPopoverContent` body; fix bottom padding to remove safe area offset |
| `modules/liquid-glass/ios/LiquidGlassModule.swift` | Register `buttonSize` and `buttonSystemImage` props on the popover view |
| `modules/liquid-glass/src/LiquidGlassPopover.types.ts` | Add `buttonSize?` and `buttonSystemImage?` to the props type |
| `modules/liquid-glass/src/LiquidGlassPopover.ios.tsx` | Pass new props through to native view; remove the `if (!visible) return null` early return so the view is always mounted |
| `app/index.tsx` | Remove conditional rendering; wrap popover in `pointerEvents`-toggling container; add Reanimated animation for search bar and button visibility; pass `buttonSize`/`buttonSystemImage` to popover |

No changes to `AddRecipeButton`, `SearchBar`, `usePhotoImport`, or the non-iOS popover fallback.

## User Experience

1. **Open**: Tap the plus button. Haptic fires. The glass circle shrinks slightly (~80%) as the plus icon fades. The circle then expands rightward-anchored into the options panel as the camera/library labels fade in. Simultaneously, the search bar slides left and fades out.
2. **Select option**: Tap camera or library. The panel morphs back to a circle (options fade, icon appears), the search bar slides back in. Then the camera/library picker launches.
3. **Dismiss**: Tap outside the panel. Same reverse morph as select.
4. Total transition: ~350ms.

## Testing Strategy

### Manual Testing (Primary)

- Morph opens smoothly from button position, glass surface stays continuous
- Content cross-fade: plus icon disappears before/as panel content appears
- Morph closes smoothly back to button shape on dismiss and on option select
- Search bar slides left on open, slides right on close
- No visual seam between the real button disappearing and the popover's collapsed state appearing
- No ghost taps on the grid or bottom bar when popover is hidden (pointerEvents)
- No blocked taps on the popover when it is visible (pointerEvents)
- Haptic feedback still fires on open
- Keyboard dismisses on open
- Rapid open/close tapping doesn't break the animation (spring retargeting)
- Works on iOS 26+ (glass effect) and iOS < 26 (ultraThinMaterial fallback)
- Expanded panel does not overlap the home indicator after bottom-padding fix

### Edge Cases

- Opening while keyboard is visible (keyboard dismiss animation and search bar fade will overlap — verify the combined effect looks acceptable)
- Empty state (no recipes, EmptyState shown) — button and morph still work
- Interrupting mid-animation (tapping during morph — spring naturally retargets)
- Very fast select after open (morph may not finish expanding before it needs to collapse — spring handles this)
- First render: popover is always mounted but hidden — verify no flash of the collapsed circle on app launch

## Performance Considerations

- The morph animation runs entirely on the SwiftUI/Core Animation layer, off the JS thread
- The always-mounted popover native view is lightweight when collapsed — the hidden measurement view and empty morphing container cost negligible layout/draw
- Reanimated search bar animation runs on the UI thread
- `pointerEvents="none"` on the RN wrapper prevents the hidden native view from participating in hit testing

## Security Considerations

None. Purely visual change.

## Documentation

- Update `docs/native-modules.md` to document `buttonSize` and `buttonSystemImage` props on `LiquidGlassPopover`

## Implementation Phases

### Phase 1: Native Morph Animation

1. Add `buttonSize` and `buttonSystemImage` props to `LiquidGlassPopoverView.swift` and register in `LiquidGlassModule.swift`
2. Add hidden measurement view to capture panel content's natural size into `@State panelSize`
3. Rewrite `LiquidGlassPopoverContent` to use animatable `frame`/`clipShape`/`opacity` with `ultraThinMaterial` background instead of `.transition(.scale(...))`
4. Implement single-spring expand first (MVP: skip the shrink phase); add inner `.fixedSize()` on options list
5. Fix bottom padding: remove `geometry.safeAreaInsets.bottom` from the bottom padding calculation
6. Update TypeScript types and iOS wrapper to pass new props; remove `if (!visible) return null` from iOS wrapper
7. Test the native morph in isolation (hardcode `visible` toggles)

### Phase 2: RN Integration

1. Refactor `app/index.tsx` to always mount the popover in a `pointerEvents`-toggling wrapper
2. Add Reanimated animation for search bar (slide left + fade)
3. Add instant-hide for the real button when popover becomes visible
4. Verify button-to-popover handoff has no visible gap or flash on-device
5. Verify no touch interception issues with `pointerEvents` toggling

### Phase 3: Polish

1. Add the two-phase shrink→expand animation (chained `withAnimation` with `asyncAfter`), or confirm single-spring is sufficient
2. Test `.glassEffect(in: RoundedRectangle(cornerRadius:))` on iOS 26+ — if shape animates smoothly, use it; if it snaps, keep `ultraThinMaterial` + `clipShape`
3. Tune spring parameters on-device (duration, bounce, delay between phases)
4. Verify expanded panel position with home indicator after safe-area padding removal
5. Handle keyboard-dismiss + search-bar-fade overlap timing if needed
6. Test the non-iOS fallback (Modal) still works unaffected

## Open Questions

1. **Dismiss destination**: When dismissing after selecting an option, should the morph fully complete back to the circle before the camera/library picker launches? Or should the picker launch immediately while the morph plays underneath?

## References

- `app/index.tsx:84-117` — Current conditional rendering of bottom bar and popover
- `features/recipe-form/components/AddRecipeButton.tsx` — Plus button (11 lines, wraps `LiquidGlassButton`)
- `features/search/components/SearchBar.tsx` — Search bar (wraps `LiquidGlassInput`)
- `modules/liquid-glass/ios/LiquidGlassPopoverView.swift` — Native popover, primary file to modify
- `modules/liquid-glass/ios/LiquidGlassButtonView.swift` — Button native impl (reference for size/padding calculations)
- `modules/liquid-glass/ios/LiquidGlassModule.swift` — Module prop registration
- `modules/liquid-glass/src/LiquidGlassPopover.types.ts` — TypeScript types
- `modules/liquid-glass/src/LiquidGlassPopover.ios.tsx` — RN→native bridge
- `features/photos/hooks/usePhotoImport/index.native.ts` — Popover visibility state management
- `lib/components/atoms/GlassLikeContainer.tsx` — Existing Reanimated spring pattern in the project
- `specs/008_source_selector/` — Original source selector spec

# Task Breakdown: Animated Import Source Selector Transition

Generated: 2026-02-20
Source: specs/015_source_selector_animation/spec.md

## Overview

Morph the plus button into the import source popover via a continuous glass-surface animation in SwiftUI, with a coordinated Reanimated search bar fade on the RN side. Five files change; no new dependencies.

## Phase 1: Native Morph Animation

### Task 1.1: Register new props on native popover

**Size**: Small
**Priority**: High
**Dependencies**: None
**Can run parallel with**: Task 1.3

**Files**:
- `modules/liquid-glass/ios/LiquidGlassPopoverView.swift`
- `modules/liquid-glass/ios/LiquidGlassModule.swift`

**Implementation**:

Add state variables and setters to `LiquidGlassPopoverView`:

```swift
// New state in LiquidGlassPopoverView
private var buttonSize: CGFloat = 48
private var buttonSystemImage: String = "plus"

func setButtonSize(_ size: CGFloat) {
  buttonSize = size
  updateContent()
}

func setButtonSystemImage(_ image: String) {
  buttonSystemImage = image
  updateContent()
}
```

Update `updateContent()` to pass the new values to the SwiftUI content struct.

Register in `LiquidGlassModule.swift` inside the existing `View(LiquidGlassPopoverView.self)` block:

```swift
Prop("buttonSize") { (view, size: CGFloat) in
  view.setButtonSize(size)
}
Prop("buttonSystemImage") { (view, image: String) in
  view.setButtonSystemImage(image)
}
```

**Acceptance Criteria**:
- [ ] `LiquidGlassPopoverView` accepts and stores `buttonSize` and `buttonSystemImage`
- [ ] Values are passed to the SwiftUI content struct via `updateContent()`
- [ ] Props are registered in the module definition
- [ ] Existing popover behavior unchanged (defaults: 48, "plus")
- [ ] Build succeeds

---

### Task 1.2: Rewrite SwiftUI popover with morph animation

**Size**: Large
**Priority**: High
**Dependencies**: Task 1.1
**Can run parallel with**: Nothing (core implementation)

**File**: `modules/liquid-glass/ios/LiquidGlassPopoverView.swift`

**Implementation**:

Rewrite `LiquidGlassPopoverContent` completely. The new version:

1. **Adds state for morph animation**:
```swift
@State private var expanded = false
@State private var panelSize: CGSize = CGSize(width: 200, height: 100)
```

2. **Adds derived animatable properties**:
```swift
private var currentWidth: CGFloat {
  expanded ? panelSize.width : buttonSize
}
private var currentHeight: CGFloat {
  expanded ? panelSize.height : buttonSize
}
private var currentCornerRadius: CGFloat {
  expanded ? 20 : buttonSize / 2
}
```

3. **Hidden measurement view** (in body, outside morphing container) to capture panel content natural size:
```swift
optionsList
    .fixedSize()
    .hidden()
    .onGeometryChange(for: CGSize.self) { proxy in
        proxy.size
    } action: { newSize in
        panelSize = newSize
    }
```

4. **Morphing container** with ZStack holding both collapsed and expanded content:
```swift
@ViewBuilder
private var morphingContainer: some View {
  ZStack {
    // Collapsed content (plus icon)
    Image(systemName: buttonSystemImage)
      .font(.system(size: buttonSize / 2.8))
      .frame(width: buttonSize, height: buttonSize)
      .opacity(expanded ? 0 : 1)

    // Expanded content (options list)
    optionsList
      .fixedSize()
      .opacity(expanded ? 1 : 0)
  }
  .frame(width: currentWidth, height: currentHeight)
  .background(.ultraThinMaterial)
  .clipShape(RoundedRectangle(cornerRadius: currentCornerRadius))
}
```

5. **Single-spring animation** (MVP, no shrink phase yet):
```swift
.onChange(of: isVisible) { newValue in
  withAnimation(.spring(duration: 0.35, bounce: 0.15)) {
    expanded = newValue
  }
}
```

6. **Fix bottom padding** — remove safe area offset:
```swift
// BEFORE:
.padding(.bottom, geometry.safeAreaInsets.bottom + 28)
// AFTER:
.padding(.bottom, 28)
```

7. **Guard morphing container visibility** when both `isVisible` and `expanded` are false (prevents flash on initial render):
```swift
if isVisible || expanded {
  // backdrop + morphingContainer
}
```

8. **Extract `optionsList` as a computed property** (same content as current `popoverMenu`, minus the `.fixedSize()` and glass styling which move to the morphing container).

**Acceptance Criteria**:
- [ ] Popover renders as a 48pt circle with plus icon when `visible` becomes true (initial collapsed state)
- [ ] Circle expands to panel size with spring animation
- [ ] Plus icon fades out, options fade in during expansion
- [ ] Reverse animation on dismiss
- [ ] Glass surface is continuous (`.ultraThinMaterial` + `.clipShape`)
- [ ] Bottom padding is 28pt from screen edge (no safe area addition)
- [ ] No flash of collapsed circle on app launch when popover is hidden
- [ ] Existing option selection and dismiss events still fire correctly
- [ ] Build succeeds

---

### Task 1.3: Update TypeScript types and iOS wrapper

**Size**: Small
**Priority**: High
**Dependencies**: None (types can be written before native code)
**Can run parallel with**: Task 1.1

**Files**:
- `modules/liquid-glass/src/LiquidGlassPopover.types.ts`
- `modules/liquid-glass/src/LiquidGlassPopover.ios.tsx`

**Implementation**:

Update types (`LiquidGlassPopover.types.ts`):
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

Update iOS wrapper (`LiquidGlassPopover.ios.tsx`):
1. Add `buttonSize` and `buttonSystemImage` to destructured props
2. Pass them through to `NativeLiquidGlassPopoverView`
3. **Remove the `if (!visible) return null` early return** — the view must always be mounted for the morph animation to work
4. Change return type from `JSX.Element | null` to `JSX.Element`

```tsx
export function LiquidGlassPopover({
  visible,
  options,
  onSelect,
  onDismiss,
  buttonSize,
  buttonSystemImage,
  style,
}: LiquidGlassPopoverProps): JSX.Element {
  // ... existing callbacks ...

  return (
    <NativeLiquidGlassPopoverView
      visible={visible}
      options={options}
      buttonSize={buttonSize}
      buttonSystemImage={buttonSystemImage}
      onOptionSelect={handleOptionSelect}
      onDismiss={handleDismiss}
      style={[styles.container, style]}
    />
  );
}
```

**Acceptance Criteria**:
- [ ] New optional props compile with no type errors
- [ ] iOS wrapper always renders the native view (no null return)
- [ ] New props are passed through to the native view
- [ ] Existing non-iOS fallback (`LiquidGlassPopover.tsx`) still compiles — it ignores the extra optional props
- [ ] Build succeeds

---

## Phase 2: RN Integration

### Task 2.1: Refactor app/index.tsx layout and animations

**Size**: Medium
**Priority**: High
**Dependencies**: Task 1.2, Task 1.3
**Can run parallel with**: Nothing (single file, all changes interdependent)

**File**: `app/index.tsx`

**Implementation**:

1. **Add imports**:
```tsx
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
```

2. **Add shared value and animated styles** inside `Content()`:
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

const buttonStyle = useAnimatedStyle(() => ({
  opacity: popoverProgress.value > 0.01 ? 0 : 1,
}));
```

3. **Replace the conditional rendering** with always-mounted layout:

Remove:
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

Replace with:
```tsx
<KeyboardAvoidingView
  behavior={Platform.OS === "ios" ? "padding" : "height"}
  style={styles.keyboardAvoid}
>
  <View style={styles.bottomBar}>
    <Animated.View style={[{ flex: 1 }, searchBarStyle]}>
      <SearchBar
        key={key}
        value={searchTerm}
        onChangeText={setSearchTerm}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    </Animated.View>
    <Animated.View style={buttonStyle}>
      <AddRecipeButton onPress={showPopover} />
    </Animated.View>
  </View>
</KeyboardAvoidingView>

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

4. **Remove the keyboard-dismiss `useEffect`** that was conditional on `popoverVisible` — the keyboard should still be dismissed, but now triggered differently since the popover is always mounted. Keep the existing `Keyboard.dismiss()` call but verify it still works.

**Acceptance Criteria**:
- [ ] Both bottom bar and popover are always in the React tree
- [ ] Search bar slides left and fades when popover opens, reverses on close
- [ ] Real plus button hides instantly when popover becomes visible
- [ ] No ghost taps when popover is hidden (`pointerEvents="none"`)
- [ ] Popover receives taps when visible (`pointerEvents="auto"`)
- [ ] Keyboard still dismisses when popover opens
- [ ] Haptic feedback still fires on button press
- [ ] No visible seam between button hide and popover collapsed-circle render
- [ ] `RecipeGrid` and `EmptyState` still receive taps normally when popover is hidden
- [ ] Build succeeds

---

## Phase 3: Polish

### Task 3.1: Add two-phase shrink-then-expand animation

**Size**: Medium
**Priority**: Medium
**Dependencies**: Task 2.1
**Can run parallel with**: Nothing (depends on on-device testing of Phase 2 result)

**File**: `modules/liquid-glass/ios/LiquidGlassPopoverView.swift`

**Implementation**:

Only pursue this if the single-spring expand from Task 1.2 feels too abrupt.

Add `shrinkScale` state and modify derived properties:
```swift
@State private var shrinkScale: CGFloat = 1.0

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
```

Replace the single `withAnimation` with two-phase chained springs:
```swift
.onChange(of: isVisible) { newValue in
  if newValue {
    // Phase 1: Shrink to 80%
    withAnimation(.spring(duration: 0.1)) {
      shrinkScale = 0.8
    }
    // Phase 2: Expand to panel (80ms delay)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
      withAnimation(.spring(duration: 0.35, bounce: 0.15)) {
        expanded = true
        shrinkScale = 1.0
      }
    }
  } else {
    withAnimation(.spring(duration: 0.3, bounce: 0.1)) {
      expanded = false
    }
  }
}
```

**Acceptance Criteria**:
- [ ] Circle visibly shrinks before expanding (the two phases are distinguishable)
- [ ] Rapid tapping doesn't break the animation (spring retargeting handles interruption)
- [ ] Reverse animation (close) still feels smooth

---

### Task 3.2: Test glass effect shape animation on iOS 26+

**Size**: Small
**Priority**: Low
**Dependencies**: Task 2.1
**Can run parallel with**: Task 3.1

**File**: `modules/liquid-glass/ios/LiquidGlassPopoverView.swift`

**Implementation**:

On an iOS 26+ device/simulator, replace `.background(.ultraThinMaterial)` with:
```swift
if #available(iOS 26.0, *) {
  morphContent
    .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: currentCornerRadius))
} else {
  morphContent
    .background(.ultraThinMaterial)
    .clipShape(RoundedRectangle(cornerRadius: currentCornerRadius))
}
```

**Acceptance Criteria**:
- [ ] If glass effect shape animates smoothly: keep the iOS 26+ path
- [ ] If glass effect shape snaps: revert to `ultraThinMaterial` + `clipShape` for all versions, or use `glassEffect` only in the fully expanded resting state

---

### Task 3.3: Final tuning and edge case verification

**Size**: Small
**Priority**: Medium
**Dependencies**: Task 3.1, Task 3.2
**Can run parallel with**: Nothing (final verification)

**Scope**:

All on-device verification:

1. Tune spring parameters (duration, bounce, delay) to feel right
2. Verify expanded panel doesn't overlap home indicator after bottom-padding fix — if it does, add internal bottom padding to the expanded panel content
3. Test keyboard-dismiss + search-bar-fade overlap when keyboard is open at tap time
4. Test rapid open/close cycling
5. Test on empty state (no recipes)
6. Verify first render has no flash of collapsed circle
7. Verify non-iOS fallback (Modal) still works

**Acceptance Criteria**:
- [ ] All manual test cases from spec Testing Strategy section pass
- [ ] All edge cases from spec pass

---

## Phase 4: Documentation

### Task 4.1: Update native modules documentation

**Size**: Small
**Priority**: Low
**Dependencies**: Task 2.1
**Can run parallel with**: Phase 3 tasks

**File**: `docs/native-modules.md`

**Implementation**:

Add `buttonSize` and `buttonSystemImage` props to the LiquidGlassPopover documentation. Add `LiquidGlassPopover` to the components list if not already present.

**Acceptance Criteria**:
- [ ] New props documented with types, defaults, and descriptions

---

## Dependency Graph

```
1.1 (native props) ─────┐
                         ├──→ 1.2 (SwiftUI morph) ──┐
1.3 (TS types + wrapper) ┘                           ├──→ 2.1 (RN integration) ──→ 3.1 (shrink phase)
                                                      │                           ──→ 3.2 (glass test)
                                                      │                                      ├──→ 3.3 (tuning)
                                                      └──→ 4.1 (docs)
```

## Parallel Execution Opportunities

- **Task 1.1 + Task 1.3**: Native prop registration and TypeScript types have no code dependency
- **Task 3.1 + Task 3.2**: Two-phase animation and glass effect test are independent experiments
- **Task 4.1**: Documentation can run in parallel with all Phase 3 tasks

## Critical Path

1.1 → 1.2 → 2.1 → 3.3

This is the minimum sequence. Tasks 1.3, 3.1, 3.2, and 4.1 can be parallelized around it.

## Summary

| Phase | Tasks | Size |
|-------|-------|------|
| Phase 1: Native Morph | 3 tasks | 1 Large, 2 Small |
| Phase 2: RN Integration | 1 task | 1 Medium |
| Phase 3: Polish | 3 tasks | 1 Medium, 2 Small |
| Phase 4: Documentation | 1 task | 1 Small |
| **Total** | **8 tasks** | |

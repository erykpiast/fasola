# SwiftUI Animation Patterns Reference

## Implicit vs Explicit Animations

```swift
// Implicit - tied to value changes
Rectangle()
    .frame(width: isExpanded ? 200 : 100)
    .animation(.spring, value: isExpanded)

// Explicit - event-driven
Button("Toggle") {
    withAnimation(.spring) { isExpanded.toggle() }
}
```

Always use `.animation(_:value:)` with value parameter. The version without value is deprecated.

## Animation Placement

Place animation modifiers after the properties they animate.

```swift
// CORRECT
Rectangle()
    .frame(width: isExpanded ? 200 : 100)
    .foregroundStyle(isExpanded ? .blue : .red)
    .animation(.default, value: isExpanded)  // After properties

// WRONG
Rectangle()
    .animation(.default, value: isExpanded)  // Too early!
    .frame(width: isExpanded ? 200 : 100)
```

## Performance: Transforms Over Layout

```swift
// GOOD - GPU accelerated
.scaleEffect(isActive ? 1.5 : 1.0)
.offset(x: isActive ? 50 : 0)
.rotationEffect(.degrees(isActive ? 45 : 0))

// BAD - layout changes are expensive
.frame(width: isActive ? 150 : 100, height: isActive ? 150 : 100)
.padding(isActive ? 50 : 0)
```

## Transitions

Transitions animate view insertion/removal. Animation context must be OUTSIDE the conditional.

```swift
// CORRECT - animation outside conditional
Button("Toggle") {
    withAnimation(.spring) { showDetail.toggle() }
}
if showDetail {
    DetailView().transition(.scale.combined(with: .opacity))
}

// WRONG - animation inside conditional (removed with view!)
if showDetail {
    DetailView()
        .transition(.slide)
        .animation(.spring, value: showDetail)  // Won't work on removal
}
```

Built-in transitions: `.opacity`, `.scale`, `.slide`, `.move(edge:)`, `.offset(x:y:)`

Asymmetric transitions:
```swift
.transition(.asymmetric(
    insertion: .scale.combined(with: .opacity),
    removal: .move(edge: .bottom).combined(with: .opacity)
))
```

## Phase Animations (iOS 17+)

Multi-step sequences:
```swift
.phaseAnimator([0, -10, 10, 0], trigger: trigger) { content, offset in
    content.offset(x: offset)
}

// Enum phases for clarity
enum BouncePhase: CaseIterable {
    case initial, up, down, settle
    var scale: CGFloat {
        switch self {
        case .initial: 1.0
        case .up: 1.2
        case .down: 0.9
        case .settle: 1.0
        }
    }
}
```

## Keyframe Animations (iOS 17+)

Precise timing with parallel tracks:
```swift
struct AnimationValues {
    var scale: CGFloat = 1.0
    var verticalOffset: CGFloat = 0
}

.keyframeAnimator(initialValue: AnimationValues(), trigger: trigger) { content, value in
    content.scaleEffect(value.scale).offset(y: value.verticalOffset)
} keyframes: { _ in
    KeyframeTrack(\.scale) {
        SpringKeyframe(1.2, duration: 0.15)
        SpringKeyframe(1.0, duration: 0.15)
    }
    KeyframeTrack(\.verticalOffset) {
        LinearKeyframe(-20, duration: 0.15)
        LinearKeyframe(0, duration: 0.25)
    }
}
```

Keyframe types: `CubicKeyframe` (smooth), `LinearKeyframe` (straight), `SpringKeyframe` (spring), `MoveKeyframe` (instant jump).

## Completion Handlers (iOS 17+)

```swift
withAnimation(.spring) {
    isExpanded.toggle()
} completion: {
    showNextStep = true
}
```

## Transactions

Implicit animations override explicit (later in view tree wins).

```swift
// .bouncy wins over .linear
Button("Tap") {
    withAnimation(.linear) { flag.toggle() }
}
.animation(.bouncy, value: flag)

// Disable animations
.transaction { $0.animation = nil }
.transaction { $0.disablesAnimations = true }
```

## Animatable Protocol

Requires explicit `animatableData` implementation:
```swift
struct ShakeModifier: ViewModifier, Animatable {
    var shakeCount: Double

    var animatableData: Double {
        get { shakeCount }
        set { shakeCount = newValue }
    }

    func body(content: Content) -> some View {
        content.offset(x: sin(shakeCount * .pi * 2) * 10)
    }
}
```

Missing `animatableData` causes silent failure (jumps to final value).

## Timing Curves

| Curve        | Use Case                          |
|--------------|-----------------------------------|
| `.spring`    | Interactive elements, most UI     |
| `.easeInOut` | Appearance changes                |
| `.bouncy`    | Playful feedback (iOS 17+)        |
| `.linear`    | Progress indicators only          |

## Avoid Animation in Hot Paths

```swift
// GOOD - gate by threshold
.onPreferenceChange(ScrollOffsetKey.self) { offset in
    let shouldShow = offset.y < -50
    if shouldShow != showTitle {
        withAnimation(.easeOut(duration: 0.2)) { showTitle = shouldShow }
    }
}

// BAD - animating every scroll frame
.onPreferenceChange(ScrollOffsetKey.self) { offset in
    withAnimation { self.offset = offset.y }  // Fires constantly
}
```

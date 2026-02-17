# iOS 26 Liquid Glass Reference

Translucent, dynamic material that reflects and refracts surrounding content. Introduced at WWDC 2025.

## Availability

```swift
if #available(iOS 26, *) {
    // Liquid Glass implementation
} else {
    // Fallback using materials
}
```

Platform: iOS 26, iPadOS 26, macOS Tahoe, watchOS 26, tvOS 26, visionOS 26.
Minimum device: iPhone 11 or iPhone SE (2nd gen).
Xcode 26+ required.

## Core API

```swift
func glassEffect<S: Shape>(
    _ glass: Glass = .regular,
    in shape: S = DefaultGlassEffectShape,
    isEnabled: Bool = true
) -> some View

struct Glass {
    static var regular: Glass    // Default, medium transparency
    static var clear: Glass      // High transparency, for media-rich backgrounds
    static var identity: Glass   // No effect, for conditional toggle

    func tint(_ color: Color) -> Glass
    func interactive() -> Glass  // iOS only: scaling, bouncing, shimmering
}
```

## Variants

| Variant    | Transparency | Use Case                              |
|------------|--------------|---------------------------------------|
| `.regular` | Medium       | Toolbars, buttons, navigation         |
| `.clear`   | High         | Small controls over photos/maps       |
| `.identity`| None         | Toggle effect on/off                  |

`.clear` requirements (all must be met):
1. Element sits over media-rich content
2. Content unaffected by dimming layer
3. Content above glass is bold and bright

## Basic Usage

```swift
// Default - regular style, capsule shape
Text("Hello, Liquid Glass!")
    .padding()
    .glassEffect()

// Explicit parameters
Text("Custom Glass")
    .padding()
    .glassEffect(.regular, in: .capsule, isEnabled: true)

// With specific shape
Text("Rounded Glass")
    .padding()
    .glassEffect(in: .rect(cornerRadius: 16))

Image(systemName: "star")
    .padding()
    .glassEffect(in: .circle)
```

## Modifier Chaining

```swift
// Tinting - selectively for primary actions, NOT decoration
.glassEffect(.regular.tint(.blue))

// Interactive - scaling, bouncing, shimmering on touch
.glassEffect(.regular.interactive())

// Combined
.glassEffect(.regular.tint(.orange).interactive())
```

## Shapes

```swift
.glassEffect(.regular, in: .capsule)                  // Default
.glassEffect(.regular, in: .circle)
.glassEffect(.regular, in: RoundedRectangle(cornerRadius: 16))
.glassEffect(.regular, in: .rect(cornerRadius: .containerConcentric))
.glassEffect(.regular, in: .ellipse)
.glassEffect(.regular, in: CustomShape())
```

## Modifier Order (Critical)

```swift
// CORRECT
Text("Label")
    .font(.headline)           // 1. Typography
    .foregroundStyle(.primary) // 2. Color
    .padding()                 // 3. Layout
    .glassEffect()             // 4. Glass effect LAST

// WRONG - glass applied before layout
Text("Label")
    .glassEffect()
    .padding()
    .font(.headline)
```

## GlassEffectContainer

Groups multiple glass elements into a unified visual unit.

```swift
GlassEffectContainer {
    HStack(spacing: 20) {
        Image(systemName: "pencil")
            .frame(width: 44, height: 44)
            .glassEffect(.regular.interactive())
        Image(systemName: "eraser")
            .frame(width: 44, height: 44)
            .glassEffect(.regular.interactive())
    }
}

// With spacing control (morphing threshold)
GlassEffectContainer(spacing: 40.0) {
    ForEach(icons) { icon in
        IconView(icon).glassEffect()
    }
}
```

Container's `spacing` parameter should match the actual spacing in your layout.

## Morphing Transitions

Requirements:
1. Elements in same `GlassEffectContainer`
2. Each view has `glassEffectID` with shared namespace
3. Views conditionally shown/hidden
4. Animation applied to state changes

```swift
struct MorphingExample: View {
    @State private var isExpanded = false
    @Namespace private var namespace

    var body: some View {
        GlassEffectContainer(spacing: 30) {
            Button(isExpanded ? "Collapse" : "Expand") {
                withAnimation(.bouncy) { isExpanded.toggle() }
            }
            .glassEffect()
            .glassEffectID("toggle", in: namespace)

            if isExpanded {
                Button("Action 1") { }
                    .glassEffect()
                    .glassEffectID("action1", in: namespace)
                Button("Action 2") { }
                    .glassEffect()
                    .glassEffectID("action2", in: namespace)
            }
        }
    }
}
```

## Button Styles

```swift
// Secondary action
Button("Cancel") { }.buttonStyle(.glass)

// Primary action
Button("Save") { }.buttonStyle(.glassProminent).tint(.blue)

// Custom glass button with shape
Button(action: { }) {
    Label("Settings", systemImage: "gear").padding()
}
.glassEffect(.regular.interactive(), in: .capsule)
```

Control sizes:
```swift
.controlSize(.mini)
.controlSize(.small)
.controlSize(.regular)       // Default
.controlSize(.large)
.controlSize(.extraLarge)    // New in iOS 26
```

Border shapes:
```swift
.buttonBorderShape(.capsule)
.buttonBorderShape(.roundedRectangle(radius: 8))
.buttonBorderShape(.circle)
```

## Toolbar Integration

```swift
NavigationStack {
    ContentView()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel", systemImage: "xmark") { }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Done", systemImage: "checkmark") { }
                // .confirmationAction automatically gets .glassProminent
            }
        }
}

// ToolbarSpacer (new in iOS 26)
ToolbarSpacer(.fixed, spacing: 20)
ToolbarSpacer(.flexible)

// Badge
Button("Notifications", systemImage: "bell") { }.badge(5).tint(.red)

// Hide glass background on toolbar item
Button("Profile", systemImage: "person.circle") { }
    .sharedBackgroundVisibility(.hidden)
```

## TabView

```swift
TabView {
    Tab("Home", systemImage: "house") { HomeView() }
    Tab("Settings", systemImage: "gear") { SettingsView() }
}
.tabBarMinimizeBehavior(.onScrollDown)  // .automatic | .onScrollDown | .never
.tabViewBottomAccessory {
    NowPlayingView()
}

// Search tab role (floating button)
Tab("Search", systemImage: "magnifyingglass", role: .search) {
    NavigationStack { SearchView() }
}
```

## Sheet Presentations

Sheets automatically receive inset Liquid Glass background in iOS 26.

```swift
// Remove custom backgrounds for glass sheets
Form { }
    .scrollContentBackground(.hidden)
    .containerBackground(.clear, for: .navigation)

// Sheet morphing from toolbar button
struct ContentView: View {
    @Namespace private var transition
    @State private var showInfo = false

    var body: some View {
        NavigationStack {
            MainContent()
                .toolbar {
                    ToolbarItem(placement: .bottomBar) {
                        Button("Info", systemImage: "info") { showInfo = true }
                            .matchedTransitionSource(id: "info", in: transition)
                    }
                }
                .sheet(isPresented: $showInfo) {
                    InfoSheet()
                        .navigationTransition(.zoom(sourceID: "info", in: transition))
                }
        }
    }
}
```

## Advanced APIs

```swift
// Union distant glass elements
func glassEffectUnion<ID: Hashable>(id: ID, namespace: Namespace.ID) -> some View
// Requirements: same ID, same glass type, similar shapes

// Transition control
func glassEffectTransition(_ transition: GlassEffectTransition, isEnabled: Bool = true) -> some View
// .identity (no changes), .matchedGeometry (default), .materialize (appearance)
```

## UIKit Integration

```swift
import UIKit

let glassEffect = UIGlassEffect(glass: .regular, isInteractive: true)
let effectView = UIVisualEffectView(effect: glassEffect)
effectView.frame = CGRect(x: 0, y: 0, width: 200, height: 50)
view.addSubview(effectView)

let containerEffect = UIGlassContainerEffect()
let containerView = UIVisualEffectView(effect: containerEffect)
```

## Fallback Pattern

```swift
extension View {
    @ViewBuilder
    func glassWithFallback(
        in shape: some Shape = .capsule,
        material: Material = .ultraThinMaterial
    ) -> some View {
        if #available(iOS 26, *) {
            self.glassEffect(.regular, in: shape)
        } else {
            self.background(material, in: shape)
        }
    }
}
```

Material proximity to glass (closest first):
`.ultraThinMaterial` > `.thinMaterial` > `.regularMaterial` > `.thickMaterial` > `.ultraThickMaterial`

## Accessibility

Automatic (no code changes): Reduced Transparency, Increased Contrast, Reduced Motion, Tinted Mode (iOS 26.1+).

```swift
@Environment(\.accessibilityReduceTransparency) var reduceTransparency

// Optional manual handling
.glassEffect(reduceTransparency ? .identity : .regular)
```

## Known Issues

1. `.glassEffect(.regular.interactive(), in: RoundedRectangle())` responds with Capsule shape.
   Workaround: Use `.buttonStyle(.glass)` for buttons.

2. `.glassProminent` + `.circle` rendering artifacts.
   Workaround: Add `.clipShape(Circle())` after button style.

## Performance

- ~13% battery drain vs ~1% in iOS 18 (iPhone 16 Pro Max)
- Increased heat and CPU/GPU load on older devices
- Mitigation: Use `GlassEffectContainer` for groups, limit continuous animations, test on 3-year-old devices, profile with Instruments

## Backward Compatibility Opt-out

Expires iOS 27:
```xml
<key>UIDesignRequiresCompatibility</key>
<true/>
```

## Complete API Quick Reference

```swift
// Core Modifiers
.glassEffect()
.glassEffect(_ glass: Glass, in shape: some Shape, isEnabled: Bool)
.glassEffectID<ID: Hashable>(_ id: ID, in namespace: Namespace.ID)
.glassEffectUnion<ID: Hashable>(id: ID, namespace: Namespace.ID)
.glassEffectTransition(_ transition: GlassEffectTransition, isEnabled: Bool)
.glassBackgroundEffect(in: some Shape, displayMode: GlassDisplayMode)

// Glass Types
Glass.regular / Glass.clear / Glass.identity
.tint(_ color: Color) -> Glass
.interactive() -> Glass

// Button Styles
.buttonStyle(.glass)
.buttonStyle(.glassProminent)

// Container
GlassEffectContainer { }
GlassEffectContainer(spacing: CGFloat) { }

// Toolbar
ToolbarSpacer(.fixed, spacing: CGFloat)
ToolbarSpacer(.flexible)
.badge(Int)
.sharedBackgroundVisibility(.hidden)

// TabView
.tabBarMinimizeBehavior(.onScrollDown | .automatic | .never)
.tabViewBottomAccessory { }
@Environment(\.tabViewBottomAccessoryPlacement) var placement

// Sheets
.presentationDetents([.medium, .large])
.scrollContentBackground(.hidden)
.containerBackground(.clear, for: .navigation)
.navigationTransition(.zoom(sourceID: ID, in: Namespace.ID))
.matchedTransitionSource(id: ID, in: Namespace.ID)

// Other
.backgroundExtensionEffect()
.controlSize(.mini | .small | .regular | .large | .extraLarge)
.buttonBorderShape(.capsule | .circle | .roundedRectangle)
```

## WWDC Sessions

- Session 219: Meet Liquid Glass
- Session 323: Build a SwiftUI app with the new design
- Session 356: Get to know the new design system

## Apple Documentation

- https://developer.apple.com/documentation/TechnologyOverviews/liquid-glass
- https://developer.apple.com/documentation/swiftui/view/glasseffect(_:in:)
- https://developer.apple.com/documentation/swiftui/glasseffectcontainer
- https://developer.apple.com/documentation/SwiftUI/Applying-Liquid-Glass-to-custom-views
- https://developer.apple.com/design/human-interface-guidelines/materials

# SwiftUI Performance Patterns Reference

## Avoid Redundant State Updates

```swift
// GOOD - only update when different
.onReceive(publisher) { value in
    if self.currentValue != value {
        self.currentValue = value
    }
}

// GOOD - gate by threshold
.onPreferenceChange(ScrollOffsetKey.self) { offset in
    let shouldShow = offset.y <= -32
    if shouldShow != shouldShowTitle {
        shouldShowTitle = shouldShow
    }
}

// BAD - updates on every callback
.onReceive(publisher) { value in
    self.currentValue = value  // Triggers view update even if same value
}
```

## Pass Only What Views Need

```swift
// GOOD - pass specific values
struct SettingsView: View {
    @State private var config = AppConfig()
    var body: some View {
        VStack {
            ThemeSelector(theme: config.theme)
            FontSizeSlider(fontSize: config.fontSize)
        }
    }
}

// BAD - pass entire object (gets notified of ALL changes)
struct SettingsView: View {
    @State private var config = AppConfig()
    var body: some View {
        VStack {
            ThemeSelector(config: config)    // Rebuilds on ANY config change
            FontSizeSlider(config: config)
        }
    }
}
```

## POD Views for Fast Diffing

A view is POD (Plain Old Data) if it only contains simple value types and no property wrappers. POD views use `memcmp` for fastest diffing.

```swift
// POD view - fastest diffing
struct FastView: View {
    let title: String
    let count: Int
    var body: some View { Text("\(title): \(count)") }
}

// Wrap expensive non-POD views in POD parent
struct ExpensiveView: View {
    let value: Int
    var body: some View { ExpensiveViewInternal(value: value) }
}

private struct ExpensiveViewInternal: View {
    let value: Int
    @State private var item: Item?
    var body: some View { /* Expensive rendering */ }
}
```

## No Object Creation in Body

```swift
// BAD - creates new formatter every body call
var body: some View {
    let formatter = DateFormatter()
    formatter.dateStyle = .long
    return Text(formatter.string(from: date))
}

// GOOD - static formatter
private static let dateFormatter: DateFormatter = {
    let f = DateFormatter()
    f.dateStyle = .long
    return f
}()

var body: some View {
    Text(Self.dateFormatter.string(from: date))
}

// BETTER - use Text format parameter
var body: some View {
    Text(date, format: .dateTime.day().month().year())
}
```

## No Inline Sorting/Filtering in ForEach

```swift
// BAD - sorts array every body call
var body: some View {
    List(items.sorted { $0.name < $1.name }) { item in
        Text(item.name)
    }
}

// GOOD - compute in model
@Observable
@MainActor
final class ItemsViewModel {
    var items: [Item] = []
    var sortedItems: [Item] { items.sorted { $0.name < $1.name } }
}
```

## Stable Identity in ForEach

```swift
// BAD - indices change when items change
ForEach(items.indices, id: \.self) { index in
    ItemRow(item: items[index])
}

// GOOD - stable Identifiable conformance
ForEach(items) { item in
    ItemRow(item: item)
}

// GOOD - explicit stable ID
ForEach(items, id: \.uniqueId) { item in
    ItemRow(item: item)
}
```

## Constant View Count in ForEach

```swift
// BAD - variable number of views per element
ForEach(items) { item in
    Text(item.title)
    if item.hasSubtitle {
        Text(item.subtitle)  // Changes view count
    }
}

// GOOD - constant count, conditional content
ForEach(items) { item in
    VStack {
        Text(item.title)
        Text(item.hasSubtitle ? item.subtitle : "")
            .opacity(item.hasSubtitle ? 1 : 0)
    }
}
```

## Avoid AnyView in Lists

```swift
// BAD - defeats view diffing
ForEach(items) { item in
    AnyView(ItemRow(item: item))
}

// GOOD
ForEach(items) { item in
    ItemRow(item: item)
}
```

## Lazy Containers for Large Lists

```swift
// BAD - renders all at once
ScrollView {
    VStack {
        ForEach(items) { item in
            ItemRow(item: item)
        }
    }
}

// GOOD - lazy rendering
ScrollView {
    LazyVStack {
        ForEach(items) { item in
            ItemRow(item: item)
        }
    }
}
```

## Gate Geometry Updates

```swift
// BAD - updates on every pixel change
.onPreferenceChange(ViewSizeKey.self) { size in
    currentSize = size
}

// GOOD - gate by threshold
.onPreferenceChange(ViewSizeKey.self) { size in
    let difference = abs(size.width - currentSize.width)
    if difference > 10 {
        currentSize = size
    }
}
```

## Avoid Layout Thrash

```swift
// BAD - deep nesting, excessive layout passes
VStack {
    HStack {
        VStack {
            HStack {
                Text("Deep")
            }
        }
    }
}

// GOOD - flatter hierarchy
VStack {
    Text("Shallow")
    Text("Structure")
}

// BAD - nested GeometryReaders
GeometryReader { outer in
    VStack {
        GeometryReader { inner in
            // Multiple layout recalculations
        }
    }
}

// GOOD - single geometry reader or containerRelativeFrame (iOS 17+)
.containerRelativeFrame(.horizontal) { width, _ in
    width * 0.8
}
```

## Debug View Updates

```swift
var body: some View {
    let _ = Self._printChanges()
    VStack { /* ... */ }
}
```

## Modifiers Over Conditional Views

Prefer modifiers for state changes to maintain view identity:

```swift
// BAD - destroys and recreates view
if isActive {
    ContentView().background(.blue)
} else {
    ContentView().background(.gray)
}

// GOOD - maintains view identity
ContentView()
    .background(isActive ? .blue : .gray)
```

## Checklist

- [ ] View body kept simple and pure (no side effects)
- [ ] Passing only needed values (not large config objects)
- [ ] Eliminating unnecessary dependencies
- [ ] State updates check for value changes before assigning
- [ ] Hot paths minimize state updates
- [ ] No object creation in body
- [ ] Heavy computation moved out of body
- [ ] ForEach uses stable identity (not .indices)
- [ ] Constant number of views per ForEach element
- [ ] No AnyView in list rows
- [ ] Large lists use LazyVStack/LazyHStack
- [ ] Geometry updates gated by thresholds
- [ ] Flat view hierarchies (minimal nesting)

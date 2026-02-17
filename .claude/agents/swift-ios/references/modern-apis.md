# SwiftUI Modern APIs Reference

## Styling

```swift
// ALWAYS use foregroundStyle() instead of foregroundColor()
Text("Hello").foregroundStyle(.primary)

// ALWAYS use clipShape() instead of cornerRadius()
Image("photo").clipShape(.rect(cornerRadius: 12))

// ALWAYS use bold() instead of fontWeight(.bold)
Text("Important").bold()
```

## Navigation

```swift
// ALWAYS use NavigationStack instead of NavigationView
NavigationStack {
    List(items) { item in
        NavigationLink(value: item) { Text(item.name) }
    }
    .navigationDestination(for: Item.self) { item in
        DetailView(item: item)
    }
}

// Type-safe routes
enum Route: Hashable { case profile, settings }
```

## Tabs (iOS 18+)

```swift
TabView {
    Tab("Home", systemImage: "house") { HomeView() }
    Tab("Search", systemImage: "magnifyingglass") { SearchView() }
}
```

When using `Tab(role:)`, all tabs must use `Tab { } label: { }` syntax. Mixing with `.tabItem()` causes compilation errors.

## Button vs onTapGesture

```swift
// CORRECT - use Button for actions
Button("Tap me") { performAction() }

// onTapGesture only when need location or count
Text("Tap anywhere").onTapGesture { location in handleTap(at: location) }
Image("photo").onTapGesture(count: 2) { handleDoubleTap() }

// Button images must always include text labels
Button("Add Item", systemImage: "plus") { addItem() }

// WRONG - image-only button without text label
Button { addItem() } label: { Image(systemName: "plus") }
```

## Layout

```swift
// AVOID UIScreen.main.bounds
// WRONG:
let screenWidth = UIScreen.main.bounds.width

// CORRECT - containerRelativeFrame (iOS 17+)
Text("Full width").containerRelativeFrame(.horizontal)

Image("hero")
    .resizable()
    .containerRelativeFrame(.horizontal) { length, axis in length * 0.8 }

// visualEffect for position-based effects
Text("Parallax")
    .visualEffect { content, geometry in
        content.offset(y: geometry.frame(in: .global).minY * 0.5)
    }
```

## onChange

```swift
// WRONG (deprecated)
.onChange(of: value) { newValue in
    handleChange(newValue)
}

// CORRECT - two-parameter variant
.onChange(of: value) { oldValue, newValue in
    handleChange(oldValue, newValue)
}

// CORRECT - no-parameter variant
.onChange(of: value) {
    handleChange()
}
```

## Sheets

```swift
// PREFER .sheet(item:) for model-based content
.sheet(item: $selectedItem) { item in
    DetailView(item: item)
}

// Over .sheet(isPresented:)
.sheet(isPresented: $showDetail) {
    DetailView(item: selectedItem!)  // Requires force unwrap
}

// Sheets should own their actions and call dismiss() internally
struct EditSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form { /* ... */ }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            save()
                            dismiss()
                        }
                    }
                }
        }
    }
}
```

## Async Work

```swift
// PREFER .task for automatic cancellation
.task {
    await loadData()
}

// .task(id:) for value-dependent tasks
.task(id: selectedItemId) {
    await loadItemDetails(selectedItemId)
}
```

## Avoid AnyView

```swift
// WRONG
func content() -> AnyView {
    if condition { return AnyView(Text("A")) }
    else { return AnyView(Image(systemName: "photo")) }
}

// CORRECT - @ViewBuilder
@ViewBuilder
func content() -> some View {
    if condition { Text("A") }
    else { Image(systemName: "photo") }
}
```

## Text Formatting

```swift
// WRONG - C-style formatting
Text(String(format: "%.2f", value))

// CORRECT - format parameter
Text(value, format: .number.precision(.fractionLength(2)))
Text(price, format: .currency(code: "USD"))
Text(ratio, format: .percent.precision(.fractionLength(1)))
Text(date, format: .dateTime.day().month().year())
```

## String Search

```swift
// WRONG - exact match
items.filter { $0.name.contains(searchText) }

// CORRECT - handles case, diacritics
items.filter { $0.name.localizedStandardContains(searchText) }
```

## ScrollView

```swift
// WRONG (deprecated)
ScrollView(showsIndicators: false) { }

// CORRECT
ScrollView {
    // content
}
.scrollIndicators(.hidden)

// Programmatic scrolling
ScrollViewReader { proxy in
    ScrollView {
        ForEach(items) { item in
            ItemRow(item: item).id(item.id)
        }
    }
    .onChange(of: targetId) {
        proxy.scrollTo(targetId, anchor: .top)
    }
}
```

## Static Member Lookup

```swift
// Prefer
.foregroundStyle(.blue)
.background(.red)
.clipShape(.rect(cornerRadius: 12))

// Over
.foregroundStyle(Color.blue)
.background(Color.red)
.clipShape(RoundedRectangle(cornerRadius: 12))
```

## Complete Replacement Table

| Deprecated                          | Modern Alternative                                     |
|-------------------------------------|--------------------------------------------------------|
| `foregroundColor()`                 | `foregroundStyle()`                                    |
| `cornerRadius()`                    | `clipShape(.rect(cornerRadius:))`                      |
| `tabItem()`                         | `Tab` API (iOS 18+)                                    |
| `onTapGesture()` for actions        | `Button`                                               |
| `NavigationView`                    | `NavigationStack`                                       |
| `onChange(of:) { value in }`        | `onChange(of:) { old, new in }` or `onChange(of:) { }`  |
| `fontWeight(.bold)`                 | `bold()`                                                |
| `GeometryReader` for sizing         | `containerRelativeFrame()` or `visualEffect()`          |
| `UIScreen.main.bounds`             | `containerRelativeFrame()`                              |
| `showsIndicators: false`           | `.scrollIndicators(.hidden)`                            |
| `String(format: "%.2f", value)`    | `Text(value, format: .number.precision(...))`           |
| `string.contains(search)`          | `string.localizedStandardContains(search)`              |
| `.sheet(isPresented:)` with model  | `.sheet(item:)`                                         |
| `AnyView`                          | `@ViewBuilder`                                          |

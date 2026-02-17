# SwiftUI View Structure Reference

## Prefer Modifiers Over Conditional Views

When you introduce a branch, consider whether you're representing multiple views or two states of the same view.

```swift
// Good - same view, different states (maintains identity)
SomeView()
    .opacity(isVisible ? 1 : 0)

// Avoid - creates/destroys view identity
if isVisible {
    SomeView()
}
```

When conditionals ARE appropriate - truly different views:
```swift
if isLoggedIn {
    DashboardView()
} else {
    LoginView()
}
```

## Extract Subviews, Not Computed Properties

`@ViewBuilder` functions re-execute on every parent state change. Separate structs allow SwiftUI to skip their `body` when inputs don't change.

```swift
// BAD - complexSection() re-executes on every tap
struct ParentView: View {
    @State private var count = 0

    var body: some View {
        VStack {
            Button("Tap: \(count)") { count += 1 }
            complexSection()  // Re-executes every tap!
        }
    }

    @ViewBuilder
    func complexSection() -> some View {
        ForEach(0..<100) { i in
            HStack {
                Image(systemName: "star")
                Text("Item \(i)")
            }
        }
    }
}

// GOOD - ComplexSection body SKIPPED when inputs don't change
struct ParentView: View {
    @State private var count = 0

    var body: some View {
        VStack {
            Button("Tap: \(count)") { count += 1 }
            ComplexSection()
        }
    }
}

struct ComplexSection: View {
    var body: some View {
        ForEach(0..<100) { i in
            HStack {
                Image(systemName: "star")
                Text("Item \(i)")
            }
        }
    }
}
```

`@ViewBuilder` functions acceptable for small, simple sections that don't affect performance.

## Container View Pattern

```swift
// BAD - closure prevents SwiftUI from skipping updates
struct MyContainer<Content: View>: View {
    let content: () -> Content
    var body: some View {
        VStack {
            Text("Header")
            content()  // Always called, can't compare closures
        }
    }
}

// GOOD - @ViewBuilder let allows comparison
struct MyContainer<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        VStack {
            Text("Header")
            content  // SwiftUI can compare and skip if unchanged
        }
    }
}
```

## ZStack vs overlay/background

Use `ZStack` for peer views that jointly define layout.
Use `overlay`/`background` for decorating a primary view.

```swift
// GOOD - decoration that should not change layout sizing
Button("Continue") { }
    .overlay(alignment: .trailing) {
        Image(systemName: "lock.fill").padding(.trailing, 8)
    }

// GOOD - background takes parent size
HStack { Text("Inbox") }
    .background { Capsule().strokeBorder(.blue, lineWidth: 2) }
```

## Own Your Container

Custom views should own static containers but not lazy/repeatable ones.

```swift
// Good - owns static container
struct HeaderView: View {
    var body: some View {
        HStack {
            Image(systemName: "star")
            Text("Title")
            Spacer()
        }
    }
}

// Good - caller owns lazy container
struct FeedView: View {
    let items: [Item]
    var body: some View {
        LazyVStack {
            ForEach(items) { item in ItemRow(item: item) }
        }
    }
}
```

## Action Handlers

View body should reference action methods, not contain logic.

```swift
// Good
Button("Publish", action: viewModel.handlePublish)

// Avoid - logic in closure
Button("Publish") {
    isLoading = true
    apiService.publish(project) { result in
        if case .error = result { showError = true }
        isLoading = false
    }
}
```

## Checklist

- [ ] Prefer modifiers over conditional views for state changes
- [ ] Complex views extracted to separate subviews
- [ ] Views kept small for better performance
- [ ] `@ViewBuilder` functions only for simple sections
- [ ] Container views use `@ViewBuilder let content: Content`
- [ ] Action handlers reference methods, not inline logic

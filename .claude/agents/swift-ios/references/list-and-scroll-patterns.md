# SwiftUI List and Scroll Patterns Reference

## ForEach Identity

Always provide stable identity. Never use `.indices` for dynamic content.

```swift
// Good - Identifiable conformance
ForEach(users) { user in UserRow(user: user) }

// Good - explicit keypath
ForEach(users, id: \.userId) { user in UserRow(user: user) }

// WRONG - indices create static content, can crash on removal
ForEach(users.indices, id: \.self) { index in UserRow(user: users[index]) }
```

Constant number of views per element:
```swift
// BAD - variable view count breaks identity
ForEach(items) { item in
    if item.isSpecial {
        SpecialRow(item: item)
        DetailRow(item: item)
    } else {
        RegularRow(item: item)
    }
}

// GOOD - consistent count, use a unified row
ForEach(items) { item in ItemRow(item: item) }
```

No inline filtering:
```swift
// BAD
ForEach(items.filter { $0.isEnabled }) { item in ItemRow(item: item) }

// GOOD - prefilter
ForEach(enabledItems) { item in ItemRow(item: item) }
```

No AnyView in list rows:
```swift
// BAD
ForEach(items) { item in AnyView(ItemRow(item: item)) }

// GOOD
ForEach(items) { item in ItemRow(item: item) }
```

Enumerated sequences must be converted to arrays:
```swift
ForEach(Array(items.enumerated()), id: \.offset) { index, item in
    Text("\(index): \(item)")
}
```

## Lazy Containers

```swift
// BAD - renders all at once
ScrollView { VStack { ForEach(items) { item in ItemRow(item: item) } } }

// GOOD - lazy rendering
ScrollView { LazyVStack { ForEach(items) { item in ItemRow(item: item) } } }
```

## ScrollView Modifiers

```swift
// Modern
ScrollView { content }.scrollIndicators(.hidden)

// Deprecated
ScrollView(showsIndicators: false) { content }
```

## Programmatic Scrolling

```swift
ScrollViewReader { proxy in
    ScrollView {
        LazyVStack {
            ForEach(messages) { message in
                MessageRow(message: message).id(message.id)
            }
            Color.clear.frame(height: 1).id("bottom")
        }
    }
    .onChange(of: messages.count) { _, _ in
        withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
    }
}
```

## Scroll Position Tracking

Gate by threshold to avoid excessive state updates:
```swift
// GOOD
.onPreferenceChange(ScrollOffsetPreferenceKey.self) { value in
    let shouldShow = value < -100
    if shouldShow != startAnimation { startAnimation = shouldShow }
}

// BAD - updates state on every scroll pixel
.onPreferenceChange(ScrollOffsetPreferenceKey.self) { value in
    scrollPosition = value
}
```

## Paging and Snap (iOS 17+)

```swift
// Paging
ScrollView(.horizontal) {
    LazyHStack(spacing: 0) {
        ForEach(pages) { page in
            PageView(page: page).containerRelativeFrame(.horizontal)
        }
    }
    .scrollTargetLayout()
}
.scrollTargetBehavior(.paging)

// Snap to items
ScrollView(.horizontal) {
    LazyHStack(spacing: 16) {
        ForEach(items) { item in ItemCard(item: item).frame(width: 280) }
    }
    .scrollTargetLayout()
}
.scrollTargetBehavior(.viewAligned)
.contentMargins(.horizontal, 20)
```

## Visual Effects on Scroll (iOS 17+)

```swift
// Scroll-based opacity
ItemCard(item: item)
    .visualEffect { content, geometry in
        let frame = geometry.frame(in: .scrollView)
        let distance = min(0, frame.minY)
        return content.opacity(1 + distance / 200)
    }
```

## List Styling

```swift
List(items) { item in
    ItemRow(item: item)
        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        .listRowSeparator(.hidden)
}
.listStyle(.plain)
.scrollContentBackground(.hidden)
.background(Color.customBackground)
.refreshable { await loadItems() }
```

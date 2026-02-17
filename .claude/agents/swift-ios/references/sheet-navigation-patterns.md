# SwiftUI Sheet and Navigation Patterns Reference

## Item-Driven Sheets (Preferred)

```swift
// GOOD - item-driven, automatic state management
@State private var selectedItem: Item?

List(items) { item in
    Button(item.name) { selectedItem = item }
}
.sheet(item: $selectedItem) { item in
    ItemDetailSheet(item: item)
}

// AVOID - boolean flag requires separate state
@State private var showSheet = false
@State private var selectedItem: Item?

Button(item.name) {
    selectedItem = item
    showSheet = true
}
.sheet(isPresented: $showSheet) {
    if let selectedItem { ItemDetailSheet(item: selectedItem) }
}
```

## Sheets Own Their Actions

Sheets handle dismiss and actions internally, not via callbacks.

```swift
struct EditItemSheet: View {
    @Environment(\.dismiss) private var dismiss
    let item: Item
    @State private var name: String

    init(item: Item) {
        self.item = item
        _name = State(initialValue: item.name)
    }

    var body: some View {
        NavigationStack {
            Form { TextField("Name", text: $name) }
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

## Type-Safe Navigation

```swift
enum Route: Hashable {
    case profile
    case settings
    case item(id: Int)
}

NavigationStack {
    List {
        NavigationLink("Profile", value: Route.profile)
        NavigationLink("Settings", value: Route.settings)
    }
    .navigationDestination(for: Route.self) { route in
        switch route {
        case .profile: ProfileView()
        case .settings: SettingsView()
        case .item(let id): ItemDetailView(id: id)
        }
    }
}
```

## Programmatic Navigation

```swift
@State private var navigationPath = NavigationPath()

NavigationStack(path: $navigationPath) {
    List {
        Button("Go to Detail") {
            navigationPath.append(Route.item(id: 1))
        }
    }
    .navigationDestination(for: Route.self) { route in
        destinationView(for: route)
    }
}
```

## Presentation Modifiers

```swift
// Full screen cover
.fullScreenCover(isPresented: $showFullScreen) { FullScreenView() }

// Popover (stays popover on iPhone)
.popover(isPresented: $showPopover) {
    PopoverContent()
        .presentationCompactAdaptation(.popover)
}

// Alert
.alert("Delete Item?", isPresented: $showAlert) {
    Button("Delete", role: .destructive) { deleteItem() }
    Button("Cancel", role: .cancel) { }
} message: {
    Text("This action cannot be undone.")
}

// Confirmation dialog
.confirmationDialog("Choose an option", isPresented: $showDialog) {
    Button("Option 1") { handleOption1() }
    Button("Option 2") { handleOption2() }
    Button("Cancel", role: .cancel) { }
}
```

## Checklist

- [ ] Use `.sheet(item:)` for model-based sheets
- [ ] Sheets own their actions and dismiss internally
- [ ] Use `NavigationStack` with `navigationDestination(for:)`
- [ ] Use `NavigationPath` for programmatic navigation
- [ ] Avoid passing dismiss/save callbacks to sheets

# SwiftUI State Management Reference

## Decision Flowchart

```
Is this value owned by this view?
+-- YES: Is it a simple value type?
|       +-- YES -> @State private var
|       +-- NO (class):
|           +-- @Observable -> @State private var (mark class @MainActor)
|           +-- Legacy ObservableObject -> @StateObject private var
+-- NO (passed from parent):
    +-- Does child need to MODIFY it?
    |   +-- YES -> @Binding var
    |   +-- NO: Does child need BINDINGS to its properties?
    |       +-- YES (@Observable) -> @Bindable var
    |       +-- NO: Does child react to changes?
    |           +-- YES -> var + .onChange()
    |           +-- NO -> let
    +-- Is it a legacy ObservableObject from parent?
        +-- YES -> @ObservedObject var (consider migrating to @Observable)
```

## Quick Reference

| Wrapper       | Use When                                                    |
|---------------|-------------------------------------------------------------|
| `@State`      | Internal view state (must be private), or owned `@Observable` |
| `@Binding`    | Child modifies parent's state                               |
| `@Bindable`   | Injected `@Observable` needing bindings (iOS 17+)           |
| `let`         | Read-only value from parent                                 |
| `var`         | Read-only value watched via `.onChange()`                    |
| `@StateObject`| View owns an `ObservableObject` (legacy, use `@State` + `@Observable`) |
| `@ObservedObject` | View receives an `ObservableObject` (legacy)           |

## @Observable (iOS 17+ Preferred)

```swift
@Observable
@MainActor
final class DataModel {
    var name = "Some Name"
    var count = 0
}

struct MyView: View {
    @State private var model = DataModel()  // @State, NOT @StateObject

    var body: some View {
        VStack {
            TextField("Name", text: $model.name)
            Stepper("Count: \(model.count)", value: $model.count)
        }
    }
}
```

## @Binding - Only When Child Modifies

```swift
// WRONG - child only displays
struct DisplayView: View {
    @Binding var title: String
    var body: some View { Text(title) }
}

// CORRECT - use let for read-only
struct DisplayView: View {
    let title: String
    var body: some View { Text(title) }
}
```

## @Bindable (iOS 17+)

For injected `@Observable` objects that need bindings:

```swift
@Observable
final class UserModel {
    var name = ""
    var email = ""
}

struct EditUserView: View {
    @Bindable var user: UserModel

    var body: some View {
        Form {
            TextField("Name", text: $user.name)
            TextField("Email", text: $user.email)
        }
    }
}
```

## @Environment with @Observable (iOS 17+)

```swift
@Observable
@MainActor
final class AppState {
    var isLoggedIn = false
}

// Inject
ContentView().environment(AppState())

// Read
struct ChildView: View {
    @Environment(AppState.self) private var appState
}
```

## Never Pass Values as @State

```swift
// WRONG - child ignores updates from parent
struct ChildView: View {
    @State var item: Item  // Only accepts initial value!
    var body: some View { Text(item.name) }  // Shows "Original" forever
}

// CORRECT
struct ChildView: View {
    let item: Item
    var body: some View { Text(item.name) }
}
```

Prevention: Always mark `@State` and `@StateObject` as `private`.

## @StateObject Initializer Pitfall

```swift
// WRONG - creates new instance on every init call
struct MovieDetailsView: View {
    @StateObject private var viewModel: MovieDetailsViewModel
    init(movie: Movie) {
        let viewModel = MovieDetailsViewModel(movie: movie)
        _viewModel = StateObject(wrappedValue: viewModel)
    }
}

// CORRECT - @autoclosure prevents multiple instantiations
struct MovieDetailsView: View {
    @StateObject private var viewModel: MovieDetailsViewModel
    init(movie: Movie) {
        _viewModel = StateObject(wrappedValue: MovieDetailsViewModel(movie: movie))
    }
}
```

## Key Principles

1. Always prefer `@Observable` over `ObservableObject` for new code
2. Mark `@Observable` classes with `@MainActor` for thread safety
3. Use `@State` with `@Observable` classes (not `@StateObject`)
4. Use `@Bindable` for injected `@Observable` objects that need bindings
5. Always mark `@State` and `@StateObject` as `private`
6. Never declare passed values as `@State` or `@StateObject`
7. With `@Observable`, nested objects work fine; with `ObservableObject`, pass nested objects directly

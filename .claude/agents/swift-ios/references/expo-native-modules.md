# Expo Modules API - Swift Reference

## Module Definition

```swift
import ExpoModulesCore

public final class MyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MyModule")

    // Lifecycle
    OnCreate { /* module created */ }
    OnDestroy { /* module destroyed */ }

    // Synchronous function (blocks JS thread)
    Function("getValue") { () -> String in
      return "hello"
    }

    // Async function (non-blocking)
    AsyncFunction("fetchData") { (url: String) async throws -> String in
      let data = try await URLSession.shared.data(from: URL(string: url)!)
      return String(data: data.0, encoding: .utf8) ?? ""
    }

    // Events (module-level, dispatched with sendEvent)
    Events("onProgress", "onComplete")

    // Native view
    View(MyExpoView.self) {
      Prop("title") { (view, title: String) in
        view.setTitle(title)
      }
      Prop("count") { (view, count: Int) in
        view.setCount(count)
      }
      Prop("color") { (view, color: String?) in
        view.setColor(color)
      }
      Events("onPress", "onChange")
    }
  }
}
```

## Type Conversions (JS to Swift)

| JavaScript        | Swift                      |
|-------------------|----------------------------|
| `number`          | `Int`, `Double`, `CGFloat` |
| `boolean`         | `Bool`                     |
| `string`          | `String`                   |
| `null`/`undefined`| `T?` (optional)            |
| `object`          | `[String: Any]` or Record  |
| `array`           | `[T]`                      |

## Records (Typed Dictionaries)

```swift
struct ImageOptions: Record {
  @Field var width: Int = 0
  @Field var height: Int = 0
  @Field var quality: Double = 1.0
}

// Usage in module
AsyncFunction("processImage") { (path: String, options: ImageOptions) async throws -> String in
  // options.width, options.height, options.quality are typed
}
```

## Events

Module-level events (dispatched from module, not view):
```swift
Events("onProgress", "onComplete")

// Dispatch from anywhere in the module
sendEvent("onProgress", ["percent": 0.5])
sendEvent("onComplete", ["result": "success"])
```

View-level events (dispatched from ExpoView):
```swift
// In module definition
View(MyExpoView.self) {
  Events("onPress", "onChange")
}

// In ExpoView subclass
let onPress = EventDispatcher()
let onChange = EventDispatcher()

// Dispatch
onPress()                          // No payload
onChange(["value": newValue])       // With payload
```

## ExpoView Pattern

```swift
import SwiftUI
import ExpoModulesCore

public final class MyExpoView: ExpoView {
  private let hostingController: UIHostingController<MyContent>

  // State mirroring JS props
  private var title: String = ""

  // Event dispatchers
  let onPress = EventDispatcher()

  public required init(appContext: AppContext? = nil) {
    let content = MyContent(title: "", onPress: { })
    hostingController = UIHostingController(rootView: content)
    hostingController.view.backgroundColor = .clear

    // Disable safe area to prevent React Native layout conflicts
    if #available(iOS 16.4, *) {
      hostingController.safeAreaRegions = []
    }
    hostingController.view.insetsLayoutMarginsFromSafeArea = false
    hostingController.view.layoutMargins = .zero
    hostingController.view.directionalLayoutMargins = .zero

    super.init(appContext: appContext)

    // Layout option 1: Auto Layout constraints
    hostingController.view.translatesAutoresizingMaskIntoConstraints = false
    addSubview(hostingController.view)
    NSLayoutConstraint.activate([
      hostingController.view.topAnchor.constraint(equalTo: topAnchor),
      hostingController.view.leadingAnchor.constraint(equalTo: leadingAnchor),
      hostingController.view.trailingAnchor.constraint(equalTo: trailingAnchor),
      hostingController.view.bottomAnchor.constraint(equalTo: bottomAnchor)
    ])

    updateContent()
  }

  // Prop setters
  func setTitle(_ newTitle: String) {
    title = newTitle
    updateContent()
  }

  // Reconstruct SwiftUI content with current prop values
  private func updateContent() {
    hostingController.rootView = MyContent(
      title: title,
      onPress: { [weak self] in
        self?.onPress()
      }
    )
  }

  // REQUIRED: Manage hosting controller as child VC
  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      if let parentVC = findViewController() {
        parentVC.addChild(hostingController)
        hostingController.didMove(toParent: parentVC)
      }
    } else {
      hostingController.willMove(toParent: nil)
      hostingController.removeFromParent()
    }
  }

  private func findViewController() -> UIViewController? {
    var responder: UIResponder? = self
    while let nextResponder = responder?.next {
      if let viewController = nextResponder as? UIViewController {
        return viewController
      }
      responder = nextResponder
    }
    return nil
  }
}
```

## Layout Options

**Auto Layout (preferred for stretching to fill):**
```swift
hostingController.view.translatesAutoresizingMaskIntoConstraints = false
addSubview(hostingController.view)
NSLayoutConstraint.activate([
  hostingController.view.topAnchor.constraint(equalTo: topAnchor),
  hostingController.view.leadingAnchor.constraint(equalTo: leadingAnchor),
  hostingController.view.trailingAnchor.constraint(equalTo: trailingAnchor),
  hostingController.view.bottomAnchor.constraint(equalTo: bottomAnchor)
])
```

**Manual frame (for fixed-size or centered content):**
```swift
addSubview(hostingController.view)
clipsToBounds = false
hostingController.view.clipsToBounds = false

public override func layoutSubviews() {
  super.layoutSubviews()
  let size = CGSize(width: containerSize, height: containerSize)
  let origin = CGPoint(
    x: (bounds.width - size.width) / 2,
    y: (bounds.height - size.height) / 2
  )
  hostingController.view.frame = CGRect(origin: origin, size: size)
}
```

## SwiftUI Content Struct

Separate from ExpoView. Pure SwiftUI with values passed as plain properties.

```swift
struct MyContent: View {
  // Props from ExpoView (plain values, not @State)
  var title: String
  var onPress: () -> Void

  // Internal SwiftUI state
  @State private var isHighlighted = false
  @FocusState private var isFocused: Bool

  var body: some View {
    if #available(iOS 26.0, *) {
      Button(action: onPress) {
        Text(title)
          .font(.system(size: 16))
          .foregroundStyle(.primary)
          .padding()
      }
      .buttonStyle(.glass)
    } else {
      Button(action: onPress) {
        Text(title)
          .font(.system(size: 16))
          .foregroundStyle(.primary)
          .padding()
      }
      .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
  }
}
```

## Color Conversion (Hex String to UIColor)

Common utility used in this project:
```swift
extension UIColor {
  convenience init?(hexString: String) {
    let hex = hexString.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
    var int: UInt64 = 0
    Scanner(string: hex).scanHexInt64(&int)
    let a, r, g, b: UInt64
    switch hex.count {
    case 3:
      (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
    case 6:
      (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
    case 8:
      (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
    default:
      return nil
    }
    self.init(
      red: CGFloat(r) / 255,
      green: CGFloat(g) / 255,
      blue: CGFloat(b) / 255,
      alpha: CGFloat(a) / 255
    )
  }
}
```

## Module Config

`modules/<module-name>/expo-module.config.json`:
```json
{
  "platforms": ["ios"],
  "ios": {
    "modules": ["MyModule"]
  }
}
```

## TypeScript Bindings

`modules/<module-name>/index.ts`:
```typescript
import { requireNativeModule, requireNativeViewManager } from 'expo-modules-core';

const MyModule = requireNativeModule('MyModule');
export const MyView = requireNativeViewManager('MyModule');

export function getValue(): string {
  return MyModule.getValue();
}

export async function fetchData(url: string): Promise<string> {
  return MyModule.fetchData(url);
}
```

## References

- https://docs.expo.dev/modules/module-api/
- https://docs.expo.dev/modules/native-module-tutorial/
- https://docs.expo.dev/modules/native-view-tutorial/

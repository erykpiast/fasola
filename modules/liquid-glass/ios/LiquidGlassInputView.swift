import SwiftUI
import ExpoModulesCore

private struct LiquidGlassSelectedTag: Identifiable {
  let id: String
  let label: String
  let accessibilityLabel: String?
}

public final class LiquidGlassInputView: ExpoView {
  private let hostingController: UIHostingController<LiquidGlassInputContent>
  
  private var value: String = ""
  private var label: String? = nil
  private var placeholder: String = ""
  private var leadingSystemImage: String? = nil
  private var showClearButtonFlag: Bool = false
  private var variant: String = "text"
  private var selectedTags: [LiquidGlassSelectedTag] = []
  private var autoFocusFlag: Bool = false

  let onChangeText = EventDispatcher()
  let onClear = EventDispatcher()
  let onTagPress = EventDispatcher()
  let onInputFocus = EventDispatcher()
  let onInputBlur = EventDispatcher()
  
  public required init(appContext: AppContext? = nil) {
    let content = LiquidGlassInputContent(
      value: value,
      label: label,
      placeholder: placeholder,
      leadingSystemImage: leadingSystemImage,
      showClearButton: showClearButtonFlag,
      variant: variant,
      selectedTags: selectedTags,
      autoFocus: autoFocusFlag,
      onChangeText: { _ in },
      onClear: { },
      onTagPress: { _ in },
      onFocus: { },
      onBlur: { }
    )
    
    hostingController = UIHostingController(rootView: content)
    hostingController.view.backgroundColor = .clear
    
    // Disable safe area and layout margin handling to prevent content offset
    if #available(iOS 16.4, *) {
      hostingController.safeAreaRegions = []
    }
    hostingController.view.insetsLayoutMarginsFromSafeArea = false
    hostingController.view.layoutMargins = .zero
    hostingController.view.directionalLayoutMargins = .zero
    
    super.init(appContext: appContext)
    
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
  
  func setValue(_ newValue: String) {
    value = newValue
    updateContent()
  }
  
  func setLabel(_ newLabel: String?) {
    label = newLabel
    updateContent()
  }
  
  func setPlaceholder(_ newPlaceholder: String) {
    placeholder = newPlaceholder
    updateContent()
  }
  
  func setLeadingSystemImage(_ image: String?) {
    leadingSystemImage = image
    updateContent()
  }
  
  func setShowClearButton(_ show: Bool) {
    showClearButtonFlag = show
    updateContent()
  }
  
  func setVariant(_ newVariant: String) {
    variant = newVariant
    updateContent()
  }

  func setSelectedTags(_ newSelectedTags: [[String: Any]]) {
    selectedTags = newSelectedTags.compactMap { rawTag in
      guard let id = rawTag["id"] as? String, let label = rawTag["label"] as? String else {
        return nil
      }

      return LiquidGlassSelectedTag(
        id: id,
        label: label,
        accessibilityLabel: rawTag["accessibilityLabel"] as? String
      )
    }
    updateContent()
  }

  func setAutoFocus(_ autoFocus: Bool) {
    autoFocusFlag = autoFocus
    updateContent()
  }
  
  private func updateContent() {
    let content = LiquidGlassInputContent(
      value: value,
      label: label,
      placeholder: placeholder,
      leadingSystemImage: leadingSystemImage,
      showClearButton: showClearButtonFlag,
      variant: variant,
      selectedTags: selectedTags,
      autoFocus: autoFocusFlag,
      onChangeText: { [weak self] text in
        self?.onChangeText(["text": text])
      },
      onClear: { [weak self] in
        self?.onClear()
      },
      onTagPress: { [weak self] id in
        self?.onTagPress(["id": id])
      },
      onFocus: { [weak self] in
        self?.onInputFocus()
      },
      onBlur: { [weak self] in
        self?.onInputBlur()
      }
    )
    hostingController.rootView = content
  }

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

private struct LiquidGlassInputContent: View {
  var value: String
  var label: String?
  var placeholder: String
  var leadingSystemImage: String?
  var showClearButton: Bool
  var variant: String
  var selectedTags: [LiquidGlassSelectedTag]
  var autoFocus: Bool
  var onChangeText: (String) -> Void
  var onClear: () -> Void
  var onTagPress: (String) -> Void
  var onFocus: () -> Void
  var onBlur: () -> Void
  
  @State private var text: String = ""
  @FocusState private var isFocused: Bool

  private var shouldShowTags: Bool {
    variant == "tags" || variant == "mixed"
  }

  private var shouldShowTextField: Bool {
    variant == "text" || variant == "mixed"
  }

  private var shouldUseAccent: Bool {
    shouldShowTags && !selectedTags.isEmpty && !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  private var shouldUseCapsuleShape: Bool {
    variant == "tags" || variant == "mixed"
  }
  
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if let labelText = label, !labelText.isEmpty, variant == "text" {
        Text(labelText)
          .font(.system(size: 16, weight: .medium))
          .foregroundStyle(.primary)
      }
      
      inputRow
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background {
          RoundedRectangle(cornerRadius: shouldUseCapsuleShape ? 24 : 24)
            .fill(.ultraThinMaterial)
            .overlay {
              RoundedRectangle(cornerRadius: shouldUseCapsuleShape ? 24 : 24)
                .stroke(
                  shouldUseAccent
                    ? Color(red: 10.0 / 255.0, green: 132.0 / 255.0, blue: 255.0 / 255.0, opacity: 0.5)
                    : .clear,
                  lineWidth: 1
                )
            }
        }
    }
    .onAppear {
      text = value
      if autoFocus {
        isFocused = true
      }
    }
    .onChange(of: value) { _, newValue in
      if text != newValue {
        text = newValue
      }
    }
  }

  @ViewBuilder
  private var inputRow: some View {
    HStack(spacing: 12) {
      if let imageName = leadingSystemImage {
        Image(systemName: imageName)
          .font(.system(size: 20))
          .foregroundStyle(.primary)
      }

      if shouldShowTags && !selectedTags.isEmpty {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 6) {
            ForEach(selectedTags) { tag in
              Button(action: {
                onTagPress(tag.id)
              }) {
                Text(tag.label)
                  .font(.system(size: 14, weight: .medium))
                  .foregroundStyle(shouldUseAccent ? .white : .primary)
                  .padding(.horizontal, 10)
                  .padding(.vertical, 4)
                  .background(
                    Capsule().fill(
                      shouldUseAccent
                        ? Color(red: 10.0 / 255.0, green: 132.0 / 255.0, blue: 255.0 / 255.0, opacity: 0.8)
                        : Color(white: 0.82, opacity: 0.75)
                    )
                  )
              }
              .buttonStyle(.plain)
              .accessibilityLabel(tag.accessibilityLabel ?? tag.label)
            }
          }
        }
        .frame(maxWidth: shouldShowTextField ? 200 : .infinity, alignment: .leading)
      }

      if shouldShowTextField {
        TextField("", text: $text, prompt: Text(placeholder).foregroundStyle(Color(white: 0.55)))
          .font(.system(size: 16))
          .foregroundStyle(.primary)
          .multilineTextAlignment(.leading)
          .focused($isFocused)
          .onChange(of: text) { _, newValue in
            onChangeText(newValue)
          }
          .onChange(of: isFocused) { _, focused in
            if focused {
              onFocus()
            } else {
              onBlur()
            }
          }
      }

      if showClearButton && !value.isEmpty {
        Button(action: {
          text = ""
          onClear()
          onChangeText("")
        }) {
          Image(systemName: "xmark.circle.fill")
            .font(.system(size: 20))
            .foregroundStyle(.secondary)
        }
        .buttonStyle(.plain)
      }
    }
  }
}

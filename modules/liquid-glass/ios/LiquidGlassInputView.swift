import SwiftUI
import ExpoModulesCore

public final class LiquidGlassInputView: ExpoView {
  private let hostingController: UIHostingController<LiquidGlassInputContent>
  
  private var value: String = ""
  private var label: String? = nil
  private var placeholder: String = ""
  private var leadingSystemImage: String? = nil
  private var showClearButtonFlag: Bool = false
  private var variant: String = "form"
  private var autoFocusFlag: Bool = false

  let onChangeText = EventDispatcher()
  let onClear = EventDispatcher()
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
      autoFocus: autoFocusFlag,
      onChangeText: { _ in },
      onClear: { },
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
      autoFocus: autoFocusFlag,
      onChangeText: { [weak self] text in
        self?.onChangeText(["text": text])
      },
      onClear: { [weak self] in
        self?.onClear()
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

struct LiquidGlassInputContent: View {
  var value: String
  var label: String?
  var placeholder: String
  var leadingSystemImage: String?
  var showClearButton: Bool
  var variant: String
  var autoFocus: Bool
  var onChangeText: (String) -> Void
  var onClear: () -> Void
  var onFocus: () -> Void
  var onBlur: () -> Void
  
  @State private var text: String = ""
  @FocusState private var isFocused: Bool
  
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if let labelText = label, !labelText.isEmpty, variant != "search" {
        Text(labelText)
          .font(.system(size: 16, weight: .medium))
          .foregroundStyle(.primary)
      }
      
      if #available(iOS 26.0, *) {
        Button(action: {
          isFocused = true
        }) {
          HStack(spacing: 8) {
            if let imageName = leadingSystemImage {
              Image(systemName: imageName)
                .font(.system(size: 20))
                .foregroundStyle(.primary)
            }
            
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
          .padding(.horizontal, 8)
          .padding(.vertical, 6)
        }
        .buttonStyle(.glass)
        .buttonBorderShape(variant == "search" ? .capsule : .roundedRectangle(radius: 24))
      } else {
        HStack(spacing: 12) {
          if let imageName = leadingSystemImage {
            Image(systemName: imageName)
              .font(.system(size: 20))
              .foregroundStyle(.primary)
          }
          
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
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background {
          RoundedRectangle(cornerRadius: variant == "search" ? 24 : 24)
            .fill(.ultraThinMaterial)
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
}

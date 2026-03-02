import SwiftUI
import ExpoModulesCore
import UIKit

private struct LiquidGlassSelectedTag: Identifiable {
  let id: String
  let label: String
  let accessibilityLabel: String?
}

private let lightModeAccentPillBackgroundColor = Color(
  red: 214.0 / 255.0,
  green: 236.0 / 255.0,
  blue: 254.0 / 255.0
) // #D6ECFE

private let lightModeAccentPillTextColor = Color(
  red: 10.0 / 255.0,
  green: 122.0 / 255.0,
  blue: 224.0 / 255.0
) // #0A7AE0

private let darkModeAccentPillBackgroundColor = Color(
  red: 82.0 / 255.0,
  green: 82.0 / 255.0,
  blue: 82.0 / 255.0
) // #525252

private let darkModeAccentPillTextColor = Color.white // #FFFFFF

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
  private var focusedOverride: Bool? = nil
  private var returnKeyType: String = "done"
  private var blurOnSubmitFlag: Bool = true

  let onChangeText = EventDispatcher()
  let onClear = EventDispatcher()
  let onTagPress = EventDispatcher()
  let onInputFocus = EventDispatcher()
  let onInputBlur = EventDispatcher()
  let onInputSubmit = EventDispatcher()
  
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
      returnKeyType: returnKeyType,
      blurOnSubmit: blurOnSubmitFlag,
      onChangeText: { _ in },
      onClear: { },
      onTagPress: { _ in },
      onFocus: { },
      onBlur: { },
      onSubmitEditing: { }
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

  func setFocused(_ isFocused: Bool) {
    focusedOverride = isFocused
    updateContent()
  }

  func setReturnKeyType(_ newReturnKeyType: String) {
    returnKeyType = newReturnKeyType
    updateContent()
  }

  func setBlurOnSubmit(_ blurOnSubmit: Bool) {
    blurOnSubmitFlag = blurOnSubmit
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
      focusedOverride: focusedOverride,
      returnKeyType: returnKeyType,
      blurOnSubmit: blurOnSubmitFlag,
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
      },
      onSubmitEditing: { [weak self] in
        self?.onInputSubmit()
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
  var focusedOverride: Bool?
  var returnKeyType: String
  var blurOnSubmit: Bool
  var onChangeText: (String) -> Void
  var onClear: () -> Void
  var onTagPress: (String) -> Void
  var onFocus: () -> Void
  var onBlur: () -> Void
  var onSubmitEditing: () -> Void
  
  @State private var text: String = ""
  @State private var isTextInputFocused: Bool = false
  @Environment(\.colorScheme) private var colorScheme

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

  private var uiReturnKeyType: UIReturnKeyType {
    switch returnKeyType {
    case "next":
      return .next
    case "search":
      return .search
    default:
      return .done
    }
  }

  private var effectiveIsFocused: Bool {
    focusedOverride ?? isTextInputFocused
  }
  
  var body: some View {
    Group {
      if let labelText = label, !labelText.isEmpty, variant == "text" {
        VStack(alignment: .leading, spacing: 8) {
          Text(labelText)
            .font(.system(size: 16, weight: .medium))
            .foregroundStyle(.primary)

          inputContainer
        }
      } else {
        inputContainer
      }
    }
    .onAppear {
      text = value
      if autoFocus && focusedOverride == nil {
        isTextInputFocused = true
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
    HStack(spacing: 4) {
      if let imageName = leadingSystemImage {
        Image(systemName: imageName)
          .font(.system(size: 20))
          .foregroundStyle(.primary)
      }

      inlineContent

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
    .onChange(of: text) { _, newValue in
      onChangeText(newValue)
    }
  }

  private var inputContainer: some View {
    inputRow
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .padding(.horizontal, 8)
      .background {
        RoundedRectangle(cornerRadius: 24)
          .fill(.ultraThinMaterial)
      }
  }

  @ViewBuilder
  private var inlineContent: some View {
    if shouldShowTags || shouldShowTextField {
      ScrollViewReader { scrollProxy in
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 6) {
            if shouldShowTags {
              ForEach(selectedTags) { tag in
                Button(action: {
                  onTagPress(tag.id)
                }) {
                  Text(tag.label)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(
                      shouldUseAccent
                        ? accentPillTextColor
                        : .primary
                    )
                    .padding(.horizontal, 4)
                    .padding(.vertical, 4)
                    .background(
                      RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(
                          shouldUseAccent
                            ? accentPillBackgroundColor
                            : Color(white: 0.82, opacity: 0.75)
                        )
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tag.accessibilityLabel ?? tag.label)
              }
            }

            if shouldShowTextField {
              BackspaceAwareTextField(
                text: $text,
                placeholder: placeholder,
                returnKeyType: uiReturnKeyType,
                isFocused: Binding(
                  get: {
                    effectiveIsFocused
                  },
                  set: { newValue in
                    if focusedOverride == nil {
                      isTextInputFocused = newValue
                    }
                  }
                ),
                blurOnSubmit: blurOnSubmit,
                onFocus: onFocus,
                onBlur: onBlur,
                onSubmit: onSubmitEditing,
                onEmptyBackspace: {
                  guard variant == "mixed", text.isEmpty, let lastTag = selectedTags.last else {
                    return
                  }

                  onTagPress(lastTag.id)
                }
              )
              .frame(minWidth: 80, idealWidth: 120)
              .frame(height: 30)
              .id("input-tail")
            } else {
              Color.clear
                .frame(width: 1, height: 1)
                .id("input-tail")
            }
          }
          .padding(.vertical, 2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .onAppear {
          scrollInlineContentToTail(scrollProxy: scrollProxy, animated: false)
        }
        .onChange(of: selectedTagIdSignature) { _, _ in
          scrollInlineContentToTail(scrollProxy: scrollProxy, animated: true)
        }
        .onChange(of: text) { _, _ in
          scrollInlineContentToTail(scrollProxy: scrollProxy, animated: true)
        }
        .onChange(of: isTextInputFocused) { _, focused in
          if focused {
            scrollInlineContentToTail(scrollProxy: scrollProxy, animated: true)
          }
        }
        .onChange(of: focusedOverride) { _, focused in
          if focused == true {
            scrollInlineContentToTail(scrollProxy: scrollProxy, animated: true)
          }
        }
      }
    }
  }

  private var selectedTagIdSignature: String {
    selectedTags.map(\.id).joined(separator: "|")
  }

  private var accentPillBackgroundColor: Color {
    colorScheme == .dark
      ? darkModeAccentPillBackgroundColor
      : lightModeAccentPillBackgroundColor
  }

  private var accentPillTextColor: Color {
    colorScheme == .dark
      ? darkModeAccentPillTextColor
      : lightModeAccentPillTextColor
  }

  private func scrollInlineContentToTail(
    scrollProxy: ScrollViewProxy,
    animated: Bool
  ) {
    let action = {
      scrollProxy.scrollTo("input-tail", anchor: .trailing)
    }

    DispatchQueue.main.async {
      if animated {
        withAnimation(.easeOut(duration: 0.16)) {
          action()
        }
      } else {
        action()
      }
    }
  }
}

private final class DeletingAwareUITextField: UITextField {
  var onEmptyBackspace: (() -> Void)?

  override func deleteBackward() {
    if (text ?? "").isEmpty {
      onEmptyBackspace?()
    }

    super.deleteBackward()
  }
}

private struct BackspaceAwareTextField: UIViewRepresentable {
  @Binding var text: String
  var placeholder: String
  var returnKeyType: UIReturnKeyType
  @Binding var isFocused: Bool
  var blurOnSubmit: Bool
  var onFocus: () -> Void
  var onBlur: () -> Void
  var onSubmit: () -> Void
  var onEmptyBackspace: () -> Void

  func makeUIView(context: Context) -> DeletingAwareUITextField {
    let textField = DeletingAwareUITextField(frame: .zero)
    textField.borderStyle = .none
    textField.font = UIFont.systemFont(ofSize: 16)
    textField.textColor = .label
    textField.backgroundColor = .clear
    textField.returnKeyType = returnKeyType
    textField.placeholder = placeholder
    textField.attributedPlaceholder = NSAttributedString(
      string: placeholder,
      attributes: [.foregroundColor: UIColor(white: 0.55, alpha: 1)]
    )
    textField.delegate = context.coordinator
    textField.onEmptyBackspace = onEmptyBackspace
    textField.addTarget(
      context.coordinator,
      action: #selector(Coordinator.handleEditingChanged(_:)),
      for: .editingChanged
    )
    return textField
  }

  func updateUIView(_ uiView: DeletingAwareUITextField, context: Context) {
    if uiView.text != text {
      uiView.text = text
    }

    uiView.returnKeyType = returnKeyType
    uiView.placeholder = placeholder
    uiView.attributedPlaceholder = NSAttributedString(
      string: placeholder,
      attributes: [.foregroundColor: UIColor(white: 0.55, alpha: 1)]
    )
    uiView.onEmptyBackspace = onEmptyBackspace

    if isFocused && !uiView.isFirstResponder {
      uiView.becomeFirstResponder()
    } else if !isFocused && uiView.isFirstResponder {
      uiView.resignFirstResponder()
    }
  }

  func makeCoordinator() -> Coordinator {
    Coordinator(
      text: $text,
      isFocused: $isFocused,
      blurOnSubmit: blurOnSubmit,
      onFocus: onFocus,
      onBlur: onBlur,
      onSubmit: onSubmit
    )
  }

  final class Coordinator: NSObject, UITextFieldDelegate {
    private var text: Binding<String>
    private var isFocused: Binding<Bool>
    private let blurOnSubmit: Bool
    private let onFocus: () -> Void
    private let onBlur: () -> Void
    private let onSubmit: () -> Void

    init(
      text: Binding<String>,
      isFocused: Binding<Bool>,
      blurOnSubmit: Bool,
      onFocus: @escaping () -> Void,
      onBlur: @escaping () -> Void,
      onSubmit: @escaping () -> Void
    ) {
      self.text = text
      self.isFocused = isFocused
      self.blurOnSubmit = blurOnSubmit
      self.onFocus = onFocus
      self.onBlur = onBlur
      self.onSubmit = onSubmit
    }

    @objc
    func handleEditingChanged(_ textField: UITextField) {
      text.wrappedValue = textField.text ?? ""
    }

    func textFieldDidBeginEditing(_ textField: UITextField) {
      if !isFocused.wrappedValue {
        isFocused.wrappedValue = true
      }
      onFocus()
    }

    func textFieldDidEndEditing(_ textField: UITextField) {
      if isFocused.wrappedValue {
        isFocused.wrappedValue = false
      }
      onBlur()
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
      onSubmit()
      if blurOnSubmit {
        isFocused.wrappedValue = false
        textField.resignFirstResponder()
      }
      return true
    }
  }
}

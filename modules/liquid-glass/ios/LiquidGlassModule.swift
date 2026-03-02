import ExpoModulesCore
import SwiftUI

public final class LiquidGlassModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiquidGlass")
    
    // LiquidGlassButton view
    View(LiquidGlassButtonView.self) {
      Prop("systemImage") { (view, image: String) in
        view.setSystemImage(image)
      }
      
      Prop("buttonSize") { (view, size: CGFloat) in
        view.setButtonSize(size)
      }
      
      Prop("containerSize") { (view, size: CGFloat) in
        view.setContainerSize(size)
      }
      
      Prop("imageScale") { (view, scale: CGFloat) in
        view.setImageScale(scale)
      }
      
      Prop("tintColor") { (view, color: String?) in
        view.setTintColor(color)
      }

      Prop("fillColor") { (view, color: String?) in
        view.setFillColor(color)
      }

      Prop("fillProgress") { (view, progress: CGFloat) in
        view.setFillProgress(progress)
      }

      Events("onButtonPress")
    }
    
    // LiquidGlassInput view
    View(LiquidGlassInputView.self) {
      Prop("value") { (view, value: String) in
        view.setValue(value)
      }
      
      Prop("label") { (view, label: String?) in
        view.setLabel(label)
      }
      
      Prop("placeholder") { (view, placeholder: String) in
        view.setPlaceholder(placeholder)
      }
      
      Prop("leadingSystemImage") { (view, image: String?) in
        view.setLeadingSystemImage(image)
      }
      
      Prop("showClearButton") { (view, show: Bool) in
        view.setShowClearButton(show)
      }
      
      Prop("variant") { (view, variant: String) in
        view.setVariant(variant)
      }

      Prop("selectedTags") { (view, selectedTags: [[String: Any]]) in
        view.setSelectedTags(selectedTags)
      }

      Prop("autoFocus") { (view, autoFocus: Bool) in
        view.setAutoFocus(autoFocus)
      }

      Prop("returnKeyType") { (view, returnKeyType: String) in
        view.setReturnKeyType(returnKeyType)
      }

      Prop("blurOnSubmit") { (view, blurOnSubmit: Bool) in
        view.setBlurOnSubmit(blurOnSubmit)
      }

      Events("onChangeText", "onClear", "onTagPress", "onInputFocus", "onInputBlur", "onInputSubmit")
    }
    
    // LiquidGlassSelect view
    View(LiquidGlassSelectView.self) {
      Prop("value") { (view, value: String) in
        view.setValue(value)
      }
      
      Prop("placeholder") { (view, placeholder: String) in
        view.setPlaceholder(placeholder)
      }
      
      Prop("systemImage") { (view, image: String) in
        view.setSystemImage(image)
      }
      
      Prop("disabled") { (view, disabled: Bool) in
        view.setDisabled(disabled)
      }
      
      Events("onSelectPress")
    }
    
    // LiquidGlassPopover view
    View(LiquidGlassPopoverView.self) {
      Prop("visible") { (view, visible: Bool) in
        view.setVisible(visible)
      }

      Prop("options") { (view, options: [[String: Any]]) in
        view.setOptions(options)
      }

      Prop("buttonSize") { (view, size: CGFloat) in
        view.setButtonSize(size)
      }

      Prop("anchor") { (view, anchor: String) in
        view.setAnchor(anchor)
      }

      Prop("buttonOffset") { (view, offset: [String: CGFloat]) in
        view.setButtonOffset(offset)
      }

      Events("onOptionSelect", "onDismiss")
    }

    // LiquidGlassSuggestions view
    View(LiquidGlassSuggestionsView.self) {
      Prop("visible") { (view, visible: Bool) in
        view.setVisible(visible)
      }

      Prop("suggestions") { (view, suggestions: [[String: Any]]) in
        view.setSuggestions(suggestions)
      }

      Events("onSuggestionPress")
    }
  }
}

private struct LiquidGlassSuggestionItem: Identifiable {
  let id: String
  let label: String
  let countLabel: String
  let accessibilityLabel: String?
}

public final class LiquidGlassSuggestionsView: ExpoView {
  private let hostingController: UIHostingController<LiquidGlassSuggestionsContent>

  private var isVisible: Bool = false
  private var suggestions: [LiquidGlassSuggestionItem] = []
  let onSuggestionPress = EventDispatcher()

  public required init(appContext: AppContext? = nil) {
    let content = LiquidGlassSuggestionsContent(
      isVisible: false,
      suggestions: [],
      onSuggestionPress: { _ in }
    )

    hostingController = UIHostingController(rootView: content)
    hostingController.view.backgroundColor = .clear

    if #available(iOS 16.4, *) {
      hostingController.safeAreaRegions = []
    }
    hostingController.view.insetsLayoutMarginsFromSafeArea = false
    hostingController.view.layoutMargins = .zero
    hostingController.view.directionalLayoutMargins = .zero

    super.init(appContext: appContext)

    addSubview(hostingController.view)
    isUserInteractionEnabled = true
    clipsToBounds = false
    hostingController.view.clipsToBounds = false
    hostingController.view.preservesSuperviewLayoutMargins = false

    updateContent()
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    hostingController.view.frame = bounds
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

  func setVisible(_ visible: Bool) {
    isVisible = visible
    updateContent()
  }

  func setSuggestions(_ suggestionsData: [[String: Any]]) {
    suggestions = suggestionsData.compactMap { rawSuggestion in
      guard let id = rawSuggestion["id"] as? String,
            let label = rawSuggestion["label"] as? String,
            let countLabel = rawSuggestion["countLabel"] as? String else {
        return nil
      }

      return LiquidGlassSuggestionItem(
        id: id,
        label: label,
        countLabel: countLabel,
        accessibilityLabel: rawSuggestion["accessibilityLabel"] as? String
      )
    }
    updateContent()
  }

  private func updateContent() {
    let content = LiquidGlassSuggestionsContent(
      isVisible: isVisible,
      suggestions: suggestions,
      onSuggestionPress: { [weak self] suggestionId in
        self?.onSuggestionPress(["id": suggestionId])
      }
    )

    hostingController.rootView = content
  }
}

private struct LiquidGlassSuggestionsContent: View {
  var isVisible: Bool
  var suggestions: [LiquidGlassSuggestionItem]
  var onSuggestionPress: (String) -> Void

  var body: some View {
    Group {
      if isVisible && !suggestions.isEmpty {
        suggestionsPanel
      } else {
        EmptyView()
      }
    }
  }

  private var suggestionsPanel: some View {
    VStack(alignment: .leading, spacing: 0) {
      ForEach(suggestions) { suggestion in
        Button(action: {
          onSuggestionPress(suggestion.id)
        }) {
          HStack(spacing: 8) {
            Text("#")
              .font(.system(size: 18, weight: .medium))
              .foregroundStyle(.secondary)
              .frame(width: 12, alignment: .center)

            Text(suggestion.label)
              .font(.system(size: 15))
              .foregroundStyle(.primary)

            Spacer()

            Text(suggestion.countLabel)
              .font(.system(size: 13))
              .foregroundStyle(.secondary)
          }
          .padding(.horizontal, 14)
          .frame(minHeight: 40)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
          suggestion.accessibilityLabel ?? "#\(suggestion.label), \(suggestion.countLabel)"
        )
      }
    }
    .background(.ultraThinMaterial)
    .clipShape(RoundedRectangle(cornerRadius: 20))
    .overlay {
      RoundedRectangle(cornerRadius: 20)
        .stroke(Color.black.opacity(0.08), lineWidth: 1)
    }
  }
}

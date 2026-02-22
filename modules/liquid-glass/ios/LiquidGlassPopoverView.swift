import SwiftUI
import ExpoModulesCore

struct PopoverOption: Identifiable {
  let id: String
  let label: String
  let systemImage: String
}

public final class LiquidGlassPopoverView: ExpoView {
  private let hostingController: UIHostingController<LiquidGlassPopoverContent>
  
  private var isVisible: Bool = false
  private var options: [PopoverOption] = []
  private var buttonSize: CGFloat = 48
  private var anchor: String = "bottomTrailing"
  private var buttonOffsetX: CGFloat = 28
  private var buttonOffsetY: CGFloat = 28
  let onOptionSelect = EventDispatcher()
  let onDismiss = EventDispatcher()
  
  public required init(appContext: AppContext? = nil) {
    let content = LiquidGlassPopoverContent(
      isVisible: false,
      options: [],
      buttonSize: 48,
      anchor: "bottomTrailing",
      buttonOffsetX: 28,
      buttonOffsetY: 28,
      onOptionSelect: { _ in },
      onDismiss: { }
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
    
    addSubview(hostingController.view)
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
  
  func setButtonSize(_ size: CGFloat) {
    buttonSize = size
    updateContent()
  }

  func setAnchor(_ value: String) {
    anchor = value
    updateContent()
  }

  func setButtonOffset(_ offset: [String: CGFloat]) {
    buttonOffsetX = offset["x"] ?? 28
    buttonOffsetY = offset["y"] ?? 28
    updateContent()
  }

  func setOptions(_ optionsData: [[String: Any]]) {
    options = optionsData.compactMap { dict in
      guard let id = dict["id"] as? String,
            let label = dict["label"] as? String,
            let systemImage = dict["systemImage"] as? String else {
        return nil
      }
      return PopoverOption(id: id, label: label, systemImage: systemImage)
    }
    updateContent()
  }
  
  private func updateContent() {
    let content = LiquidGlassPopoverContent(
      isVisible: isVisible,
      options: options,
      buttonSize: buttonSize,
      anchor: anchor,
      buttonOffsetX: buttonOffsetX,
      buttonOffsetY: buttonOffsetY,
      onOptionSelect: { [weak self] optionId in
        self?.onOptionSelect(["id": optionId])
      },
      onDismiss: { [weak self] in
        self?.onDismiss()
      }
    )
    hostingController.rootView = content
  }
}

struct HighlightButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .opacity(configuration.isPressed ? 0.5 : 1.0)
      .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
  }
}

struct LiquidGlassPopoverContent: View {
  var isVisible: Bool
  var options: [PopoverOption]
  var buttonSize: CGFloat
  var anchor: String
  var buttonOffsetX: CGFloat
  var buttonOffsetY: CGFloat
  var onOptionSelect: (String) -> Void
  var onDismiss: () -> Void

  @State private var expanded = false
  @State private var shrinkScale: CGFloat = 1.0
  @State private var appearOpacity: CGFloat = 0
  @State private var panelSize: CGSize = CGSize(width: 200, height: 100)
  @State private var animationGeneration: Int = 0

  private var currentWidth: CGFloat {
    let base = expanded ? panelSize.width : buttonSize
    return base * shrinkScale
  }

  private var currentHeight: CGFloat {
    let base = expanded ? panelSize.height : buttonSize
    return base * shrinkScale
  }

  private var currentCornerRadius: CGFloat {
    expanded ? 20 : (buttonSize * shrinkScale) / 2
  }

  var body: some View {
    GeometryReader { _ in
      ZStack {
        if isVisible || expanded {
          anchoredLayout
            .opacity(appearOpacity)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
            .onTapGesture {
              onDismiss()
            }
        }

        // Hidden measurement view to capture panel natural size
        optionsList
          .fixedSize()
          .hidden()
          .onGeometryChange(for: CGSize.self) { proxy in
            proxy.size
          } action: { newSize in
            panelSize = newSize
          }
      }
    }
    .ignoresSafeArea()
    .onChange(of: isVisible) { _, newValue in
      // Generation counter cancels stale Phase 2 callbacks on rapid open/dismiss.
      // The dismiss branch must reset shrinkScale to 1.0 to handle the case where
      // Phase 1 set it to 0.8 but Phase 2 was cancelled by the guard.
      animationGeneration += 1
      let currentGeneration = animationGeneration
      if newValue {
        // Fade in the morph circle to match the React button fade-out
        appearOpacity = 0
        withAnimation(.spring(response: 0.25, dampingFraction: 0.9)) {
          appearOpacity = 1
        }
        // Phase 1: Shrink the button circle to 80%
        withAnimation(.spring(duration: 0.1)) {
          shrinkScale = 0.8
        }
        // Phase 2: Expand to panel size
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
          guard animationGeneration == currentGeneration else { return }
          withAnimation(.spring(duration: 0.35, bounce: 0.3)) {
            expanded = true
            shrinkScale = 1.0
          }
        }
      } else {
        // Reverse: collapse to circle in one spring
        withAnimation(.spring(duration: 0.3, bounce: 0.1)) {
          expanded = false
          shrinkScale = 1.0
          appearOpacity = 0
        }
      }
    }
  }

  private var morphContent: some View {
    ZStack {
      // Expanded content (options list)
      optionsList
        .fixedSize()
        .opacity(expanded ? 1 : 0)
    }
    .frame(width: currentWidth, height: currentHeight)
  }

  @ViewBuilder
  private var morphingContainer: some View {
    if #available(iOS 26.0, *) {
      morphContent
        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: currentCornerRadius))
    } else {
      morphContent
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: currentCornerRadius))
    }
  }

  @ViewBuilder
  private var anchoredLayout: some View {
    if anchor == "topTrailing" {
      VStack {
        HStack {
          Spacer()
          morphingContainer
        }
        Spacer()
      }
      .padding(.trailing, buttonOffsetX)
      .padding(.top, buttonOffsetY)
    } else {
      VStack {
        Spacer()
        HStack {
          Spacer()
          morphingContainer
        }
      }
      .padding(.trailing, buttonOffsetX)
      .padding(.bottom, buttonOffsetY)
    }
  }

  private var optionsList: some View {
    VStack(alignment: .leading, spacing: 0) {
      ForEach(Array(options.enumerated()), id: \.element.id) { index, option in
        Button(action: {
          let generator = UIImpactFeedbackGenerator(style: .light)
          generator.impactOccurred()
          onOptionSelect(option.id)
        }) {
          HStack(spacing: 12) {
            Image(systemName: option.systemImage)
              .font(.system(size: 20))
              .frame(width: 24)
            Text(option.label)
              .font(.body)
          }
          .padding(.horizontal, 16)
          .padding(.vertical, 14)
        }
        .buttonStyle(HighlightButtonStyle())

        if index < options.count - 1 {
          Divider()
        }
      }
    }
  }
}

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
  
  let onOptionSelect = EventDispatcher()
  let onDismiss = EventDispatcher()
  
  public required init(appContext: AppContext? = nil) {
    let content = LiquidGlassPopoverContent(
      isVisible: false,
      options: [],
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

struct LiquidGlassPopoverContent: View {
  var isVisible: Bool
  var options: [PopoverOption]
  var onOptionSelect: (String) -> Void
  var onDismiss: () -> Void
  
  var body: some View {
    GeometryReader { geometry in
      ZStack {
        // Invisible backdrop for outside tap detection
        if isVisible {
          Color.clear
            .contentShape(Rectangle())
            .onTapGesture {
              onDismiss()
            }
        }
        
        // Popover content positioned at the bottom-right with safe area
        VStack {
          Spacer()
          HStack {
            Spacer()
            if isVisible {
              popoverMenu
                .transition(
                  .scale(scale: 0.5, anchor: .bottomTrailing)
                  .combined(with: .opacity)
                )
            }
          }
        }
        .padding(.trailing, 28)
        .padding(.bottom, geometry.safeAreaInsets.bottom + 28)
      }
      .animation(.spring(duration: 0.3, bounce: 0.2), value: isVisible)
    }
    .ignoresSafeArea()
  }
  
  @ViewBuilder
  private var popoverMenu: some View {
    if #available(iOS 26.0, *) {
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
          .buttonStyle(.plain)
          
          if index < options.count - 1 {
            Divider()
          }
        }
      }
      .fixedSize()
      .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 20))
    } else {
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
          .buttonStyle(.plain)
          
          if index < options.count - 1 {
            Divider()
          }
        }
      }
      .fixedSize()
      .background(.ultraThinMaterial)
      .clipShape(RoundedRectangle(cornerRadius: 20))
    }
  }
}

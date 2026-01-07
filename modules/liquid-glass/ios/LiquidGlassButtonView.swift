import SwiftUI
import ExpoModulesCore

public final class LiquidGlassButtonView: ExpoView {
  private let hostingController: UIHostingController<LiquidGlassButtonContent>
  private let glassPaddingRatio: CGFloat = 1.4
  
  private var systemImage: String = "plus"
  private var buttonSize: CGFloat = 48
  private var containerSize: CGFloat = 96
  
  let onButtonPress = EventDispatcher()
  
  public required init(appContext: AppContext? = nil) {
    let imageSize = buttonSize / glassPaddingRatio
    let fontSize = imageSize / glassPaddingRatio
    let content = LiquidGlassButtonContent(
      systemImage: systemImage,
      imageSize: imageSize,
      fontSize: fontSize,
      containerSize: containerSize,
      onPress: { }
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
    
    // Center the hosting view in the wrapper, allowing overflow
    let hostingSize = CGSize(width: containerSize, height: containerSize)
    let originX = (bounds.width - containerSize) / 2
    let originY = (bounds.height - containerSize) / 2
    
    hostingController.view.frame = CGRect(origin: CGPoint(x: originX, y: originY), size: hostingSize)
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
  
  func setSystemImage(_ image: String) {
    systemImage = image
    updateContent()
  }
  
  func setButtonSize(_ size: CGFloat) {
    buttonSize = size
    setNeedsLayout()
    updateContent()
  }
  
  func setContainerSize(_ size: CGFloat) {
    containerSize = size
    setNeedsLayout()
    updateContent()
  }
  
  private func updateContent() {
    let imageSize = buttonSize / glassPaddingRatio
    let fontSize = imageSize / glassPaddingRatio
    let content = LiquidGlassButtonContent(
      systemImage: systemImage,
      imageSize: imageSize,
      fontSize: fontSize,
      containerSize: containerSize,
      onPress: { [weak self] in
        self?.onButtonPress()
      }
    )
    hostingController.rootView = content
  }
}

struct LiquidGlassButtonContent: View {
  var systemImage: String
  var imageSize: CGFloat
  var fontSize: CGFloat
  var containerSize: CGFloat
  var onPress: () -> Void
  
  var body: some View {
    GeometryReader { geometry in
      if #available(iOS 26.0, *) {
        Button(action: onPress) {
          Image(systemName: systemImage)
            .font(.system(size: fontSize))
            .foregroundStyle(.primary)
            .frame(width: imageSize, height: imageSize)
        }
        .buttonBorderShape(.circle)
        .buttonStyle(.glass)
        .position(x: geometry.size.width / 2, y: geometry.size.height / 2)
      } else {
        Button(action: onPress) {
          Image(systemName: systemImage)
            .font(.system(size: fontSize))
            .foregroundStyle(.primary)
            .frame(width: imageSize, height: imageSize)
        }
        .background {
          Circle()
            .fill(.ultraThinMaterial)
        }
        .buttonStyle(.plain)
        .position(x: geometry.size.width / 2, y: geometry.size.height / 2)
      }
    }
    .frame(width: containerSize, height: containerSize)
  }
}

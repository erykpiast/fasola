import SwiftUI
import ExpoModulesCore

public final class LiquidGlassSelectView: ExpoView {
  private let hostingController: UIHostingController<LiquidGlassSelectContent>
  
  private var value: String = ""
  private var placeholder: String = ""
  private var systemImage: String = "chevron.down"
  private var disabled: Bool = false
  
  let onSelectPress = EventDispatcher()
  
  public required init(appContext: AppContext? = nil) {
    let content = LiquidGlassSelectContent(
      value: value,
      placeholder: placeholder,
      systemImage: systemImage,
      disabled: disabled,
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
    hostingController.view.preservesSuperviewLayoutMargins = false
    
    super.init(appContext: appContext)
    
    hostingController.view.translatesAutoresizingMaskIntoConstraints = false
    addSubview(hostingController.view)
    
    NSLayoutConstraint.activate([
      hostingController.view.topAnchor.constraint(equalTo: topAnchor),
      hostingController.view.leadingAnchor.constraint(equalTo: leadingAnchor),
      hostingController.view.trailingAnchor.constraint(equalTo: trailingAnchor),
      hostingController.view.bottomAnchor.constraint(equalTo: bottomAnchor)
    ])
  }
  
  func setValue(_ newValue: String) {
    value = newValue
    updateContent()
  }
  
  func setPlaceholder(_ newPlaceholder: String) {
    placeholder = newPlaceholder
    updateContent()
  }
  
  func setSystemImage(_ image: String) {
    systemImage = image
    updateContent()
  }
  
  func setDisabled(_ isDisabled: Bool) {
    disabled = isDisabled
    updateContent()
  }
  
  private func updateContent() {
    let content = LiquidGlassSelectContent(
      value: value,
      placeholder: placeholder,
      systemImage: systemImage,
      disabled: disabled,
      onPress: { [weak self] in
        self?.onSelectPress()
      }
    )
    hostingController.rootView = content
  }
}

struct LiquidGlassSelectContent: View {
  var value: String
  var placeholder: String
  var systemImage: String
  var disabled: Bool
  var onPress: () -> Void
  
  var body: some View {
    if #available(iOS 26.0, *) {
      Button(action: onPress) {
        HStack {
          Text(value.isEmpty ? placeholder : value)
            .font(.system(size: 16))
            .foregroundStyle(value.isEmpty ? .secondary : .primary)
            .lineLimit(1)
          
          Spacer()
          
          Image(systemName: systemImage)
            .font(.system(size: 20))
            .foregroundStyle(.primary)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
      }
      .buttonStyle(.glass)
      .buttonBorderShape(.roundedRectangle(radius: 24))
      .disabled(disabled)
      .opacity(disabled ? 0.5 : 1.0)
      .allowsHitTesting(!disabled)
    } else {
      HStack {
        Text(value.isEmpty ? placeholder : value)
          .font(.system(size: 16))
          .foregroundStyle(value.isEmpty ? .secondary : .primary)
          .lineLimit(1)
        
        Spacer()
        
        Image(systemName: systemImage)
          .font(.system(size: 20))
          .foregroundStyle(.primary)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 14)
      .background {
        RoundedRectangle(cornerRadius: 24)
          .fill(.ultraThinMaterial)
      }
      .opacity(disabled ? 0.5 : 1.0)
      .contentShape(Rectangle())
      .onTapGesture {
        if !disabled {
          onPress()
        }
      }
    }
  }
}

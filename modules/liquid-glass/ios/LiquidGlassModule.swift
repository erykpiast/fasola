import ExpoModulesCore

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
      
      Events("onChangeText", "onClear", "onInputFocus", "onInputBlur")
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
  }
}

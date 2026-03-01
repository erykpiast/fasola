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

      Events("onChangeText", "onClear", "onTagPress", "onInputFocus", "onInputBlur")
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
  }
}

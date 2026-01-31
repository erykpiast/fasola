# Implementation Plan

## Status Summary

**Spec 001 (Alignment):** COMPLETE - Implementation verified
**Spec 002 (Non-Interactive Buttons):** NOT COMPLETE - Missing `didMoveToWindow` in InputView and SelectView
**Spec 009 (Glass Source Form):** PARTIALLY COMPLETE - Glass components implemented, debug code removed

---

## Spec 002: Fix Non-Interactive Components

### Root Cause
`LiquidGlassInputView.swift` and `LiquidGlassSelectView.swift` are missing the `didMoveToWindow` lifecycle method that properly connects the `UIHostingController` to the parent view controller hierarchy. Without this, SwiftUI gesture recognizers don't function.

### Phase 1: Fix LiquidGlassInputView

- [x] **2.1** Add `didMoveToWindow` and `findViewController` to `LiquidGlassInputView.swift`
  - File: `modules/liquid-glass/ios/LiquidGlassInputView.swift`
  - Add after line 110 (end of `updateContent` method):
    ```swift
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
    ```
  - Verify: Input field accepts text on Add Source Form

### Phase 2: Fix LiquidGlassSelectView

- [ ] **2.2** Add full safe area disabling to `LiquidGlassSelectView.swift`
  - File: `modules/liquid-glass/ios/LiquidGlassSelectView.swift`
  - After line 24 (`hostingController.view.insetsLayoutMarginsFromSafeArea = false`), add:
    ```swift
    if #available(iOS 16.4, *) {
      hostingController.safeAreaRegions = []
    }
    hostingController.view.layoutMargins = .zero
    hostingController.view.directionalLayoutMargins = .zero
    ```
  - Verify: Select component alignment matches buttons

- [ ] **2.3** Add `didMoveToWindow` and `findViewController` to `LiquidGlassSelectView.swift`
  - File: `modules/liquid-glass/ios/LiquidGlassSelectView.swift`
  - Add after line 101 (end of `hitTest` method):
    ```swift
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
    ```
  - Verify: Source selector responds to taps

### Phase 3: Remove Debug Code from Swift Files

- [ ] **2.4** Remove debug logging from `LiquidGlassSelectView.swift`
  - File: `modules/liquid-glass/ios/LiquidGlassSelectView.swift`
  - Remove: Lines 67-69 (debugLog in onPress)
  - Remove: Lines 79-87 (debugLog in layoutSubviews)
  - Remove: Lines 91-99 (debugLog in hitTest)
  - Remove: Lines 104-127 (debugLog function definition)
  - Verify: No file writes to `.cursor/debug.log`

### Phase 4: Rebuild and Verify

- [ ] **2.5** Rebuild iOS app
  - Command: `npx expo run:ios`
  - Required: After all Swift changes

- [ ] **2.6** Verify Add Source Form functionality
  - Navigate: (+) → Choose from Library → select photo → tap source selector → scroll to "Add new source" → tap "Set source"
  - Test Close button (X): Tapping dismisses the form
  - Test Input field: Tapping focuses, keyboard appears, text entry works
  - Test Checkmark button: Tapping with non-empty input saves and dismisses
  - Test visual alignment: All components remain aligned (spec 001 not regressed)

---

## Spec 009: Glass Source Form

### Status: Verification Required

Implementation tasks completed:
- [x] `AddSourceForm.tsx` uses `LiquidGlassButton` and `LiquidGlassInput`
- [x] `SourceSelector.tsx` uses `LiquidGlassSelect` for trigger
- [x] `LiquidGlassPicker` created for source selection modal
- [x] Debug code removed from JS/TS files

### Pending Verification

- [ ] **9.1** Verify source picker modal has glass background
- [ ] **9.2** Verify "Add New Source" modal has glass styling
- [ ] **9.3** Verify all interactions work (select source, add new source, cancel)

---

## Previously Completed

### Spec 001: Add Source Form Alignment
- [x] **1.1** Safe area disabling added to `LiquidGlassInputView.swift` (lines 36-42)

### Spec 008: Source Selector Menu
- [x] **8.1** `LiquidGlassMenuView.swift` created
- [x] **8.2** View registered in `LiquidGlassModule.swift`
- [x] **8.3** TypeScript types created
- [x] **8.4** `LiquidGlassMenu.ios.tsx` created
- [x] **8.5** `LiquidGlassMenu.tsx` wrapper created
- [x] **8.6** Exported from `liquid-glass/index.ts`
- [x] **8.7** `AddRecipeButton.tsx` updated to use `LiquidGlassMenu`
- [x] **8.8** `usePhotoImport` hook refactored
- [x] **8.9** Search bar animation added in `app/index.tsx`

### Phase 3: Debug Code Cleanup (JS/TS)
- [x] **5.1** Debug logging removed from `AddSourceForm.tsx`
- [x] **5.2** Debug logging removed from `AddRecipeForm.tsx`
- [x] **5.3** Debug logging removed from `LiquidGlassMenu.tsx`
- [x] **5.4** No remaining debug code in JS/TS files

### Phase 4: TypeScript Fixes
- [x] **6.1** Import extensions fixed in `liquid-glass/index.ts`

### Phase 5: Export Pattern Fix
- [x] **7.1** Liquid-glass components refactored to proper platform-specific pattern

---

## Notes

1. **Build Requirement**: After Swift changes, run `npx expo run:ios`. Metro bundler won't pick up native changes.

2. **iOS Version Targeting**: Glass style requires iOS 26+. All native components have `@available(iOS 26.0, *)` checks with `ultraThinMaterial` fallbacks.

3. **Auto-Accept Timer**: When testing AddSourceForm, tap source selector within 5 seconds of photo selection.

4. **Pattern Reference**: `LiquidGlassButtonView.swift` contains the correct implementation pattern with `didMoveToWindow` and `findViewController`.

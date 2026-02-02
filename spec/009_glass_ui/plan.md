# Implementation Plan: Glass UI Components

## Feature: Liquid Glass Popover and Inline Source Editor

**Purpose:** Replace modal-based interactions with native liquid glass UI components  
**User benefit:** More polished, contextual interactions that feel native to iOS 26+  
**Scope:**

- Import source popover (replaces ActionSheet)
- Inline source name editor (replaces modal)

## Verification Approach

Each phase includes verification steps using the **iOS Simulator Agent** (`.claude/agents/ios-simulator.md`). The agent provides:

- `ui_describe_all` - Get full UI element tree for assertions
- `ui_tap` - Tap elements by coordinates
- `ui_type` - Type text into focused inputs
- `ui_swipe` - Scroll and swipe gestures
- `screenshot` - Capture visual state for documentation

**Running verifications:**

1. Ensure iOS Simulator is booted: `npm run ios`
2. Use the ios-simulator agent subagent to execute verification steps
3. Each verification step is independent - failures don't block subsequent steps
4. Capture screenshots at key moments for visual documentation

## Context

### Existing code

| File                                                     | Purpose                                                         |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| `features/recipe-form/components/AddRecipeButton.tsx`    | (+) button that triggers import                                 |
| `features/photos/hooks/usePhotoImport/index.native.ts`   | Photo import with ActionSheetIOS                                |
| `features/search/components/SearchBar.tsx`               | Search input in bottom bar                                      |
| `features/source-selector/components/SourceSelector.tsx` | Source selection with modals                                    |
| `app/index.tsx`                                          | Main recipes list with bottom bar (SearchBar + AddRecipeButton) |
| `modules/liquid-glass/`                                  | Native iOS glass components                                     |

### Dependencies

- Expo Modules Core (for native view bridge)
- SwiftUI (iOS 26+ `.glass` style, fallback to `.ultraThinMaterial`)
- Existing `LiquidGlassButton` and `LiquidGlassInput` components

### Constraints

- iOS only (native implementation)
- Must maintain web fallback behavior
- Popover positioning relative to (+) button anchor
- Must handle keyboard avoiding for inline input

### Critical: Native Component Vertical Alignment

When multiple native SwiftUI components are displayed in a row (e.g., source selector + input + buttons), they **must** all have identical safe area handling to prevent vertical misalignment after interaction.

**Root cause of vertical shift:** `UIHostingController` automatically propagates safe area insets to SwiftUI views. When iOS recalculates safe areas (keyboard appear/dismiss, system UI changes, interaction events), components with inconsistent safe area handling will shift vertically relative to each other.

**Required countermeasures for ALL native component views:**

```swift
// In init(), after creating hostingController:

// 1. Disable safe area propagation (iOS 16.4+)
if #available(iOS 16.4, *) {
  hostingController.safeAreaRegions = []
}

// 2. Disable layout margin inheritance
hostingController.view.insetsLayoutMarginsFromSafeArea = false
hostingController.view.layoutMargins = .zero
hostingController.view.directionalLayoutMargins = .zero

// 3. Prevent margin preservation from parent
hostingController.view.preservesSuperviewLayoutMargins = false
```

**Components status:**

| Component              | Status     | Action needed  |
| ---------------------- | ---------- | -------------- |
| LiquidGlassInputView   | ✅ Has fix | None           |
| LiquidGlassButtonView  | ✅ Has fix | None           |
| LiquidGlassSelectView  | ✅ Has fix | None           |
| LiquidGlassPopoverView | ❌ Missing | Add in Phase 1 |

### Assumptions

- iOS 16.4+ required (UIHostingController)
- iOS 26+ for optimal glass effect
- Popover dismisses on any selection or outside tap
- Only two import options: Camera and Photo Library

## Requirements

| Requirement                            | Solution approach                         | Phase |
| -------------------------------------- | ----------------------------------------- | ----- |
| Popover replaces ActionSheet           | New `LiquidGlassPopover` native component | 1     |
| Popover shows icon + label rows        | SwiftUI list with SF Symbols              | 1     |
| Popover replaces search bar and button | State management in `app/index.tsx`       | 1     |
| Dismiss on selection/outside tap       | Native SwiftUI gesture handling           | 1     |
| Show original UI after import complete | Callback coordination                     | 1     |
| Inline source input (no modal)         | Edit mode state in SourceSelector         | 2     |
| Cancel (x) and confirm (✅) buttons    | LiquidGlassButton integration             | 2     |
| Auto-focus input on activation         | Native autoFocus prop                     | 2     |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      app/index.tsx                          │
│  ┌─────────────────┐  ┌─────────────────────────────────┐   │
│  │  RecipeGrid     │  │         BottomBar               │   │
│  │                 │  │  ┌──────────────────────────┐   │   │
│  │                 │  │  │ importPopoverVisible?    │   │   │
│  │                 │  │  │   → LiquidGlassPopover   │   │   │
│  │                 │  │  │   else → SearchBar +     │   │   │
│  │                 │  │  │          AddRecipeButton │   │   │
│  │                 │  │  └──────────────────────────┘   │   │
│  └─────────────────┘  └─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│               SourceSelector (edit mode)                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ isEditingNewSource?                                  │   │
│  │   → LiquidGlassInput + (x) button + (✓) button       │   │
│  │   else → LiquidGlassSelect (existing)                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Key interfaces

```typescript
// New native component
type LiquidGlassPopoverProps = {
  visible: boolean;
  options: Array<{
    id: string;
    label: string;
    systemImage: string;
  }>;
  onSelect: (id: string) => void;
  onDismiss: () => void;
  style?: ViewStyle;
};

// Updated usePhotoImport return type
type UsePhotoImportReturn = {
  startImport: () => void; // Now just shows popover
  handleOptionSelect: (option: "camera" | "library") => Promise<void>;
  isImporting: boolean;
  popoverVisible: boolean;
  dismissPopover: () => void;
};

// Updated SourceSelector (internal state)
type SourceSelectorState = {
  isEditingNewSource: boolean;
  newSourceText: string;
};
```

### Data flow

**Import Popover:**

1. User taps (+) button → `popoverVisible = true`
2. SearchBar and AddRecipeButton hidden, LiquidGlassPopover shown
3. User taps option → `onSelect('camera'|'library')` called
4. Popover dismissed, photo picker opens
5. After photo import completes → navigate to `/recipe/add`
6. Original UI restored (SearchBar + AddRecipeButton visible)

**Inline Source Editor:**

1. User taps LiquidGlassSelect → picker modal opens
2. User selects "Add new source" → modal closes, `isEditingNewSource = true`
3. LiquidGlassInput shown with (x) and (✓) buttons
4. User types source name
5. User taps (✓) → source saved, `isEditingNewSource = false`, selector shows new value
6. OR user taps (x) → `isEditingNewSource = false`, selector unchanged

## Phase 1: LiquidGlassPopover Component and Import Integration

**Deliverable:** New native iOS popover component integrated into the import flow, replacing ActionSheet

### New files:

- [ ] `modules/liquid-glass/ios/LiquidGlassPopoverView.swift` - Native SwiftUI popover view
- [ ] `modules/liquid-glass/src/LiquidGlassPopover.tsx` - Web fallback (renders nothing)
- [ ] `modules/liquid-glass/src/LiquidGlassPopover.ios.tsx` - iOS native wrapper
- [ ] `modules/liquid-glass/src/LiquidGlassPopover.types.ts` - TypeScript types

### Files to modify:

- [ ] `modules/liquid-glass/ios/LiquidGlassModule.swift` - Register popover view
- [ ] `modules/liquid-glass/index.ts` - Export new component
- [ ] `app/index.tsx` - Add popover state and conditional rendering
- [ ] `features/photos/hooks/usePhotoImport/index.native.ts` - Remove ActionSheet, expose popover state
- [ ] `features/recipe-form/components/AddRecipeButton.tsx` - Connect to popover visibility
- [ ] `platform/i18n/translations/en.json` - Add popover-specific labels if needed

### Implementation details:

**Swift Component (`LiquidGlassPopoverView.swift`):**

```swift
// Key structure:
// - VStack with rounded corners and glass material
// - ForEach over options array
// - Each row: HStack { Image(systemName:) Text(label) }
// - Tap gesture on each row calls onOptionSelect event
// - Full-screen invisible overlay for outside tap detection
```

**CRITICAL: Safe area countermeasures (add to init):**

```swift
// In init(), after creating hostingController:
if #available(iOS 16.4, *) {
  hostingController.safeAreaRegions = []
}
hostingController.view.insetsLayoutMarginsFromSafeArea = false
hostingController.view.layoutMargins = .zero
hostingController.view.directionalLayoutMargins = .zero
hostingController.view.preservesSuperviewLayoutMargins = false
```

This prevents iOS from shifting the popover content when safe areas are recalculated.

**Component behavior:**

- Appears with fade animation
- Shows options vertically with icon on left, label on right
- Each option is tappable with highlight state
- Invisible backdrop captures outside taps → calls onDismiss
- Uses `.ultraThinMaterial` (iOS < 26) or `.glass` style (iOS 26+)

**State management in `app/index.tsx`:**

```typescript
const [importPopoverVisible, setImportPopoverVisible] = useState(false);

// In bottom bar:
{importPopoverVisible ? (
  <LiquidGlassPopover
    visible={true}
    options={[
      { id: 'camera', label: t('addPhoto.camera'), systemImage: 'camera' },
      { id: 'library', label: t('addPhoto.library'), systemImage: 'photo.on.rectangle' },
    ]}
    onSelect={handleImportOptionSelect}
    onDismiss={() => setImportPopoverVisible(false)}
  />
) : (
  <>
    <SearchBar ... />
    <AddRecipeButton onPress={() => setImportPopoverVisible(true)} />
  </>
)}
```

**Updated `usePhotoImport`:**

- Remove `ActionSheetIOS.showActionSheetWithOptions` call
- `startImport` now just sets popover visible
- Export `importFromCamera` and `importFromLibrary` for external calling
- Handle navigation after successful import

### Validation:

1. Run `npm run lint`
2. Run `cd ios && pod install` (required when adding new native Swift files)
3. Build iOS app: `npm run ios` - **must pass without errors**

### Verification (iOS Simulator Agent):

**Step 1: Popover renders and replaces bottom bar UI**

1. Launch app in simulator
2. Call `ui_describe_all` to verify initial state:
   - SearchBar element exists (text input with placeholder)
   - AddRecipeButton exists (+ button)
3. Tap the (+) button
4. Call `ui_describe_all` to verify:
   - SearchBar element is NOT in UI tree
   - AddRecipeButton is NOT in UI tree
   - LiquidGlassPopover IS visible with "Camera" and "Photo Library" options
   - Two option rows with correct labels and icons (SF Symbols)
5. Take screenshot to verify glass styling

**Step 2: Popover positioning (anchored correctly)**

1. With popover visible, call `ui_describe_all` to get popover frame coordinates
2. Verify popover is positioned near the bottom of screen (where button was)
3. Take screenshot to confirm visual anchoring

**Step 3: Option selection dismisses popover**

1. From main screen, tap (+) button to show popover
2. Call `ui_describe_all` to find "Camera" option coordinates
3. Tap the Camera option
4. Call `ui_describe_all` to verify:
   - Popover is dismissed (element no longer in UI tree)
   - Camera permission dialog or camera UI is visible
5. Dismiss camera (cancel)

**Step 4: Outside tap dismisses and restores UI**

1. From main screen, tap (+) button to show popover
2. Tap coordinates outside the popover bounds (e.g., on the recipe grid area)
3. Call `ui_describe_all` to verify:
   - Popover is no longer visible
   - SearchBar element is visible again
   - AddRecipeButton is visible again

**Step 5: Library option opens photo picker**

1. From main screen, tap (+) button to show popover
2. Find and tap "Photo Library" option
3. Call `ui_describe_all` to verify:
   - Popover is dismissed
   - Photo library picker is visible
4. Dismiss library picker

**Step 6: Cancel during import restores UI**

1. Tap (+) to show popover
2. Tap "Photo Library"
3. In photo picker, tap Cancel
4. Call `ui_describe_all` to verify:
   - App returns to main screen
   - SearchBar and AddRecipeButton are visible (original UI restored)

**Step 7: Full import flow (end-to-end)**

1. Add a test photo to simulator if needed
2. Tap (+) button to show popover
3. Tap "Photo Library" option
4. Select a photo from the library
5. Call `ui_describe_all` to verify:
   - App navigated to add recipe screen (`/recipe/add`)
6. Return to main screen
7. Verify SearchBar and AddRecipeButton are visible again

**Step 8: Dark mode popover styling**

1. Switch simulator to dark mode (Settings → Display & Brightness)
2. Launch app
3. Tap (+) to show popover
4. Take screenshot
5. Verify glass material adapts to dark mode

**Step 9: Light mode popover styling**

1. Switch simulator to light mode
2. Launch app
3. Tap (+) to show popover
4. Take screenshot
5. Verify glass material looks correct in light mode

---

## Phase 2: Inline Source Editor

**Deliverable:** Adding new source uses inline input instead of modal

**Note:** This phase can be developed in parallel with Phase 1.

### Files to modify:

- [ ] `features/source-selector/components/SourceSelector.tsx` - Add edit mode with inline input

### Implementation details:

**State changes:**

```typescript
const [isEditingNewSource, setIsEditingNewSource] = useState(false);
const [newSourceText, setNewSourceText] = useState("");
```

**Conditional rendering:**

```typescript
{isEditingNewSource ? (
  <View style={styles.editContainer}>
    <LiquidGlassInput
      value={newSourceText}
      onChangeText={setNewSourceText}
      placeholder={t('sourceSelector.addNewPlaceholder')}
      variant="form"
      autoFocus
      returnKeyType="done"
      onSubmitEditing={handleConfirmNewSource}
    />
    <LiquidGlassButton
      systemImage="xmark"
      size={40}
      onPress={handleCancelEdit}
    />
    <LiquidGlassButton
      systemImage="checkmark"
      size={40}
      onPress={handleConfirmNewSource}
    />
  </View>
) : (
  <LiquidGlassSelect ... />
)}
```

**Behavior:**

- When user selects "Add new source" from picker → close picker, set `isEditingNewSource = true`
- Input is auto-focused, keyboard appears
- (x) button: reset state, show selector
- (✅) button: save source, update value, reset state
- Keyboard "Done" action same as (✅)

**Remove:**

- Add New Source modal (`addNewModalVisible` state and `<Modal>` component)

### Validation:

1. Run `npm run typecheck`
2. Run `npm run lint`

### Verification (iOS Simulator Agent):

**Pre-requisite:** Navigate to the add recipe screen (import a photo first, or have an existing recipe to edit).

**Step 1: Source selector opens picker**

1. Navigate to add/edit recipe screen
2. Call `ui_describe_all` to find LiquidGlassSelect for source
3. Tap the source selector element
4. Call `ui_describe_all` to verify picker modal is visible
5. Verify "Add new source" option is present in picker

**Step 2: "Add new source" triggers inline edit mode**

1. With picker modal open, tap "Add new source" option
2. Call `ui_describe_all` to verify:
   - Picker modal is dismissed
   - LiquidGlassInput is visible (text input for new source name)
   - Cancel button (x icon) is visible
   - Confirm button (checkmark icon) is visible
   - Keyboard is visible (input is focused)
3. Take screenshot to document inline edit UI

**Step 3: Cancel button dismisses without saving**

1. Trigger inline edit mode (tap selector → "Add new source")
2. Use `ui_type` to enter text: "Test Source Cancel"
3. Tap the cancel (x) button
4. Call `ui_describe_all` to verify:
   - Inline input is no longer visible
   - LiquidGlassSelect is visible again
   - Select value has NOT changed to "Test Source Cancel"

**Step 4: Confirm button saves new source**

1. Trigger inline edit mode (tap selector → "Add new source")
2. Use `ui_type` to enter text: "My New Source"
3. Tap the confirm (checkmark) button
4. Call `ui_describe_all` to verify:
   - Inline input is no longer visible
   - LiquidGlassSelect is visible again
   - Select value shows "My New Source" (check `AXValue` or visible text)

**Step 5: Keyboard "Done" action saves**

1. Trigger inline edit mode (tap selector → "Add new source")
2. Use `ui_type` to enter text: "Keyboard Done Source"
3. Tap the keyboard's "Done" button (find in UI tree or use return key)
4. Call `ui_describe_all` to verify:
   - Inline input is dismissed
   - LiquidGlassSelect shows "Keyboard Done Source"

**Step 6: New source persists in picker**

1. After creating a source in Step 4 or 5
2. Tap the source selector again
3. Call `ui_describe_all` to verify:
   - Previously created source appears in the picker options
   - User can select it for other recipes

**Step 7: Empty source history state**

1. Clear app data or use fresh simulator
2. Navigate to add recipe screen
3. Tap source selector
4. Verify picker shows only "Add new source" option
5. Create a new source via inline edit
6. Verify it appears in picker for future selections

**Step 8: Many sources in picker**

1. Create 10+ sources using inline edit flow
2. Tap source selector
3. Call `ui_describe_all` to verify picker handles long list
4. Use `ui_swipe` to scroll through sources if needed
5. Verify all sources are accessible

**Step 9: Dark mode inline edit styling**

1. Switch simulator to dark mode (Settings → Display & Brightness)
2. Navigate to add recipe screen
3. Trigger inline source edit
4. Take screenshot
5. Verify glass input and buttons adapt to dark mode

**Step 10: Light mode inline edit styling**

1. Switch simulator to light mode
2. Navigate to add recipe screen
3. Trigger inline source edit
4. Take screenshot
5. Verify styling looks correct in light mode

**Step 11: Vertical alignment stability after interactions**

This step verifies the critical fix for iOS safe area handling. All components in the inline edit row must remain vertically aligned after interactions.

1. Navigate to add recipe screen
2. Trigger inline source edit (tap selector → "Add new source")
3. Call `ui_describe_all` and record Y coordinates for:
   - LiquidGlassInput frame
   - Cancel button (x) frame
   - Confirm button (✓) frame
4. Use `ui_type` to enter text in the input field
5. Tap the input to focus/unfocus several times
6. Call `ui_describe_all` again and compare Y coordinates
7. **Verify:** All three components have identical Y positions (within 1px tolerance)
8. **Verify:** Y coordinates have NOT shifted from initial measurement
9. Dismiss keyboard by tapping outside
10. Call `ui_describe_all` one more time
11. **Verify:** Y coordinates still match initial measurement

---

## Phase 3: Polish and Edge Cases

**Deliverable:** Handle cross-cutting edge cases and final polish

### Tasks:

- [ ] Add haptic feedback on popover interactions
- [ ] Handle keyboard dismissal when popover shown
- [ ] Ensure web fallback works (uses original ActionSheet/modal behavior)
- [ ] Test on different device sizes

### Files to modify:

- [ ] Various - based on testing findings

### Validation:

1. Run `npm run typecheck`
2. Run `npm run lint`

### Verification (iOS Simulator Agent):

**Step 1: Haptic feedback (manual observation)**

1. Use physical device or simulator with haptics enabled
2. Tap (+) button to show popover → feel haptic
3. Tap popover option → feel haptic on selection
4. (Note: Simulator may not provide haptic feedback - verify on device)

**Step 2: Different device sizes - iPhone SE (small)**

1. Boot iPhone SE simulator
2. Launch app
3. Tap (+) → verify popover fits on screen
4. Navigate to add recipe screen
5. Trigger inline source edit → verify it doesn't overflow
6. Take screenshots of both

**Step 3: Different device sizes - iPhone Pro Max (large)**

1. Boot iPhone Pro Max simulator
2. Launch app
3. Tap (+) → verify popover is properly positioned
4. Navigate to add recipe screen
5. Trigger inline source edit → verify spacing looks proportional
6. Take screenshots of both

**Step 4: Full regression - complete flow**

1. Launch app fresh
2. Tap (+) → verify popover appears
3. Select Library → verify picker opens
4. Select photo → verify navigation to add screen
5. Tap source selector → verify picker opens
6. Tap "Add new source" → verify inline edit
7. Enter name and confirm → verify source saved
8. Complete recipe save
9. Return to main screen → verify UI restored

---

## Summary

| Phase | Focus                           | Key Files                                                  | Complexity | Verification Steps |
| ----- | ------------------------------- | ---------------------------------------------------------- | ---------- | ------------------ |
| 1     | Popover component + import flow | `modules/liquid-glass/`, `app/index.tsx`, `usePhotoImport` | High       | 9                  |
| 2     | Inline source editor            | `SourceSelector.tsx`                                       | Medium     | 11                 |
| 3     | Polish and edge cases           | Various                                                    | Low        | 4                  |

**Dependencies between phases:**

- Phase 2 is independent (can be done in parallel with Phase 1)
- Phase 3 should be done last (after Phase 1 and Phase 2)

**Verification notes:**

- Each phase is self-contained with its own verification steps
- Phase 1 includes popover positioning, dark/light mode, and full import flow verification
- Phase 2 includes source history states, dark/light mode, and inline edit verification
- Phase 3 covers cross-cutting concerns: haptic feedback, device sizes, and full regression

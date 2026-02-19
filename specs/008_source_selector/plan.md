# Source Selector Menu Implementation Plan

## Overview

Transform the ( + ) button into an expandable glass menu that provides multiple source options (Camera, Photo Library, etc.). When activated, the menu smoothly expands from the button position while the search bar fades away.

## Reference Analysis

The reference image shows a classic iOS-style context menu with:
- Glass/blur background effect
- System icons with labels arranged vertically
- Two sections separated by a divider
- Menu items: Scan Text, Scan Documents, Take Photo or Video, Choose Photo or Video, Record Audio, Attach File

## Design Goals

1. **Flexible API** - The menu component accepts a list of `(id, label, systemImage)` tuples from React Native, making it reusable for different contexts
2. **Native feel on iOS** - Leverage SwiftUI's `Menu` with glass styling for authentic iOS experience
3. **Cross-platform fallback** - ActionSheet/Alert fallback for web and older iOS versions

**Initial menu items for recipe import:**
- **Take Photo** - Launch camera
- **Choose from Library** - Open photo picker

Future options (scanning, URL import) can be added by extending the items array.

---

## Approach: Native Menu + React Native Orchestration

Create a native `LiquidGlassMenu` component for iOS that handles menu display, while React Native orchestrates the surrounding UI animations (search bar hiding).

---

## Component API

### `LiquidGlassMenu`

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `items` | `Array<{ id, label, systemImage }>` | required | Menu items to display |
| `onItemSelect` | `(id: string) => void` | required | Called when item is selected |
| `onMenuWillOpen` | `() => void` | - | Called when menu begins opening |
| `onMenuDidClose` | `() => void` | - | Called when menu finishes closing |
| `buttonSystemImage` | `string` | `"plus"` | SF Symbol for trigger button |
| `buttonSize` | `number` | `48` | Button diameter in points |

---

## Implementation Phases

### Phase 1: Native iOS Menu Component

Create `LiquidGlassMenuView.swift` that:
- Accepts items array from React Native props
- Renders SwiftUI `Menu` with glass styling (iOS 26+) or ultraThinMaterial fallback
- Emits events for item selection and menu open/close state

Register the view in `LiquidGlassModule.swift`.

### Phase 2: React Native Wrapper

Create wrapper files following existing patterns:
- `LiquidGlassMenu.types.ts` - TypeScript types
- `LiquidGlassMenu.native.tsx` - Native view manager import
- `LiquidGlassMenu.ios.tsx` - iOS implementation wrapping native view
- `LiquidGlassMenu.tsx` - Fallback using ActionSheet (iOS) or Alert (web/Android)

Export from `liquid-glass/index.ts`.

### Phase 3: Update Feature Components

**`AddRecipeButton.tsx`:**
- Replace `LiquidGlassButton` with `LiquidGlassMenu`
- Define menu items with translated labels
- Map item selection to import actions
- Forward menu open/close events to parent

**`usePhotoImport` hook:**
- Refactor to expose `importFromCamera` and `importFromLibrary` as separate functions
- Remove the `ActionSheetIOS` logic (now handled by menu component)

### Phase 4: Search Bar Animation

Update `app/index.tsx`:
- Add state/refs for menu open status
- Use `react-native-reanimated` shared values for search bar opacity/scale
- On `onMenuWillOpen`: animate search bar out (opacity → 0, scale → 0.8)
- On `onMenuDidClose`: animate search bar back (opacity → 1, scale → 1)

---

## File Changes Summary

| File | Action |
|------|--------|
| `modules/liquid-glass/ios/LiquidGlassMenuView.swift` | Create |
| `modules/liquid-glass/ios/LiquidGlassModule.swift` | Modify |
| `modules/liquid-glass/src/LiquidGlassMenu.native.tsx` | Create |
| `modules/liquid-glass/src/LiquidGlassMenu.ios.tsx` | Create |
| `modules/liquid-glass/src/LiquidGlassMenu.tsx` | Create (fallback) |
| `modules/liquid-glass/src/LiquidGlassMenu.types.ts` | Create |
| `modules/liquid-glass/index.ts` | Modify |
| `features/recipe-form/components/AddRecipeButton.tsx` | Modify |
| `features/photos/hooks/usePhotoImport/index.native.ts` | Modify |
| `features/photos/hooks/usePhotoImport/index.d.ts` | Modify |
| `features/photos/hooks/usePhotoImport/index.web.ts` | Modify |
| `app/index.tsx` | Modify |

---

## Testing Checklist

- [ ] Menu opens with haptic feedback on button press
- [ ] Menu items display correctly (icon + label)
- [ ] Selecting "Take Photo" launches camera
- [ ] Selecting "Choose from Library" opens photo picker
- [ ] Dismissing menu (tap outside) restores search bar
- [ ] Search bar fades out when menu opens
- [ ] Search bar fades in when menu closes
- [ ] Animation timing feels responsive (~200ms)
- [ ] Works on iOS 26+ with glass styling
- [ ] Fallback works on iOS < 26 (ultraThinMaterial)
- [ ] Fallback works on web (action sheet or alert)

---

## Open Questions

1. **Haptic feedback**: Should selecting a menu item provide additional haptic feedback?
2. **Keyboard handling**: If search bar is focused when menu opens, should keyboard dismiss?
3. **Menu sections**: Should the API support grouping items with dividers (like the reference)?
4. **Item states**: Should items support `destructive` or `disabled` flags?

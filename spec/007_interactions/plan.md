# Feature: Interaction Improvements

**Purpose:** Add navigation and action buttons to enhance user flow and control across recipe screens.

**User benefit:** Easier navigation with back button, ability to cancel imports, and quick recipe deletion.

**Scope:**
- ✅ Back button on recipe preview screen (left bottom corner)
- ✅ Cancel button on add recipe screen (bottom right, with discard confirmation)
- ✅ Remove button on preview screen (red trash bin, with delete confirmation)

---

## Context

### Existing Code

| File | Relevance |
|------|-----------|
| `features/recipe-preview/components/RecipeViewScreen.tsx` | Target for back button and remove button |
| `features/recipe-form/components/AddRecipeForm.tsx` | Target for cancel button (already has close button but needs repositioning and animation stop) |
| `lib/components/atoms/EditButton.tsx` | Pattern for button styling (uses LiquidGlassButton) |
| `features/recipe-import/components/ConfirmButton.tsx` | Has `stop()` method to halt auto-confirm animation |
| `features/recipes-list/context/RecipesContext.tsx` | Missing `deleteRecipe` method - needs to be added |
| `lib/repositories/recipes.ts` | Has `delete(id)` method already implemented |
| `platform/i18n/translations/en.json` | Needs new translation keys |

### Dependencies
- `@/modules/liquid-glass` - LiquidGlassButton component
- `expo-haptics` - Haptic feedback
- `expo-router` - Navigation
- `@/lib/alert` - Cross-platform alert dialogs

### Constraints
- Button placement must follow existing design patterns
- Cancel behavior must match edit screen (discard confirmation dialog)
- Remove must show confirmation before deleting

---

## Requirements Mapping

| Requirement | Solution Approach | Phase |
|-------------|-------------------|-------|
| Back button returns to recipes list | Add LiquidGlassButton with `chevron.left` icon in bottom left of RecipeViewScreen | 1 |
| Cancel button on add screen | Reposition existing close button to bottom right corner, ensure it stops animation | 2 |
| Cancel stops auto-confirm animation | Call `confirmButtonRef.current?.stop()` before showing discard dialog | 2 |
| Remove button with confirmation | Add red trash button next to edit button, show Alert.alert confirmation | 3 |
| Delete recipe from DB | Add `deleteRecipe` method to RecipesContext that calls repository.delete | 3 |

---

## Architecture

### Component Hierarchy (RecipeViewScreen)

```
RecipeViewScreen
├── RecipeImageDisplay
├── [isProcessing]
│   ├── ActivityIndicator
│   └── bottomBar
│       ├── SourceSelector
│       └── ConfirmButton
└── [isReady]
    ├── MetadataOverlay
    ├── BackButton (NEW - bottom left)
    ├── DeleteButton (NEW - left of EditButton)
    └── EditButton (existing - bottom right)
```

### Component Hierarchy (AddRecipeForm)

```
AddRecipeForm
├── Image
└── processingBottomBar
    ├── CancelButton (MOVED from top - bottom right of bar)
    ├── SourceSelector
    └── ConfirmButton
```

### Key Interfaces

```typescript
// RecipesContext - add deleteRecipe
type RecipesContextValue = {
  // ... existing methods
  deleteRecipe: (id: RecipeId) => Promise<void>;
};

// New BackButton component (reusable)
function BackButton({ onPress }: { onPress: () => void }): JSX.Element;

// New DeleteButton component
function DeleteButton({ onPress }: { onPress: () => void }): JSX.Element;
```

### Data Flow

**Back Button:**
1. User taps back button → 
2. `router.back()` called →
3. Navigate to recipes list

**Cancel Button (Add Screen):**
1. User taps cancel →
2. `confirmButtonRef.current?.stop()` called (stops animation) →
3. Show discard confirmation Alert →
4. If confirmed: `router.back()`

**Remove Button:**
1. User taps trash icon →
2. Show confirmation Alert (Cancel/Delete) →
3. If confirmed: `deleteRecipe(id)` →
4. Navigate back to list

---

## Implementation Roadmap

### Phase 1: Back Button on Recipe Preview

**Deliverable:** Users can navigate back from recipe preview to recipes list.

#### Files to modify:

- [ ] `features/recipe-preview/components/RecipeViewScreen.tsx`
  - Add BackButton component in isReady block
  - Position in bottom left corner (opposite to EditButton)

#### New files:

- [ ] `lib/components/atoms/BackButton.tsx`
  - Use LiquidGlassButton with `chevron.left` system image
  - Style: position absolute, bottom: 28, left: 28

#### Translation keys:

- [ ] `platform/i18n/translations/en.json`
  - Add `"accessibility.back": "Go back"`

#### Validation:

1. Navigate to a ready recipe
2. Verify back button appears in bottom left
3. Tap button → returns to recipes list

---

### Phase 2: Cancel Button on Add Recipe Screen

**Deliverable:** Users can cancel recipe import with proper confirmation.

#### Files to modify:

- [ ] `features/recipe-form/components/AddRecipeForm.tsx`
  - Move cancel button to bottom bar (right side, after ConfirmButton)
  - Add `confirmButtonRef` prop to stop animation on cancel
  - Modify `handleClose` to call `confirmButtonRef.current?.stop()` first

#### Prop changes:

```typescript
// AddRecipeForm props - add confirmButtonRef
export function AddRecipeForm({
  // ... existing props
  confirmButtonRef: React.RefObject<ConfirmButtonRef>;
}): JSX.Element
```

#### Validation:

1. Start adding a recipe (photo selected)
2. Wait for auto-confirm animation to start
3. Tap cancel button → animation stops + discard dialog appears
4. Confirm discard → returns to home

---

### Phase 3: Remove Button with Confirmation

**Deliverable:** Users can delete recipes with confirmation.

#### Files to modify:

- [ ] `features/recipes-list/context/RecipesContext.tsx`
  - Add `deleteRecipe` method to context value
  - Implement using `recipeRepository.delete(id)`
  - Update recipes state by filtering out deleted recipe

- [ ] `features/recipe-preview/components/RecipeViewScreen.tsx`
  - Add DeleteButton in isReady block
  - Position between BackButton and EditButton (left of edit)
  - Implement confirmation dialog with Alert.alert
  - On confirm: call `deleteRecipe(id)`, then `router.replace("/")`

#### New files:

- [ ] `lib/components/atoms/DeleteButton.tsx`
  - Use LiquidGlassButton with `trash` system image
  - Apply red tint styling (custom color prop or wrapper)
  - Position: bottom: 28, right: 28 + 48 + 12 (offset from EditButton)

#### Translation keys:

- [ ] `platform/i18n/translations/en.json`
  - Add `"deleteRecipe.title": "Delete Recipe?"`
  - Add `"deleteRecipe.message": "This action cannot be undone."`
  - Add `"deleteRecipe.cancel": "Cancel"`
  - Add `"deleteRecipe.confirm": "Delete"`
  - Add `"accessibility.delete": "Delete recipe"`

#### Validation:

1. Navigate to a ready recipe
2. Verify trash button appears (red, left of edit)
3. Tap trash → confirmation dialog
4. Tap Cancel → dialog dismissed, no action
5. Tap Delete → recipe removed, navigate to list
6. Verify recipe no longer in list

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Cancel on add with no source selected | Show discard dialog anyway (always confirm) |
| Delete while processing | Delete button only shown when `isReady` |
| Double-tap delete | Disable button after first tap until action completes |
| Network error on delete | Show error toast, stay on screen |

---

## Testing Checklist

### Unit Tests
- [ ] `deleteRecipe` correctly removes recipe from state
- [ ] Cancel handler stops animation before showing dialog

### Integration Tests
- [ ] Back button navigates to correct screen
- [ ] Delete flow: tap → confirm → recipe removed
- [ ] Cancel flow: tap → stop animation → dialog → discard

### Manual Tests
- [ ] Haptic feedback on all button presses
- [ ] Buttons accessible with VoiceOver
- [ ] Correct button positions on various screen sizes

---

## File Summary

| Action | File Path |
|--------|-----------|
| CREATE | `lib/components/atoms/BackButton.tsx` |
| CREATE | `lib/components/atoms/DeleteButton.tsx` |
| MODIFY | `features/recipe-preview/components/RecipeViewScreen.tsx` |
| MODIFY | `features/recipe-form/components/AddRecipeForm.tsx` |
| MODIFY | `features/recipes-list/context/RecipesContext.tsx` |
| MODIFY | `platform/i18n/translations/en.json` |

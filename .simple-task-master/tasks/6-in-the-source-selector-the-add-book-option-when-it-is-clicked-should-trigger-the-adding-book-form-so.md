---
schema: 1
id: 6
title: In the source selector the add book option, when it is clicked, should trigger the adding book form so the user doesn't need to confirm the selection.
status: planned
created: "2026-03-09T22:54:11.371Z"
updated: "2026-03-09T22:54:11.371Z"
tags:
  - ux
dependencies: []
---

It's unclear for the user what they should do when selecting that option. Maybe clicking on any option should confirm the choice?

## Implementation Plan

## Relevant Files

- **`features/source-selector/components/SourceSelector.tsx`** — The core component with the native iOS picker modal and "Add new" option. Contains the two-step flow (scroll picker → confirm → inline input).
- **`features/recipe-form/components/AddRecipeForm.tsx`** — Parent form that hosts the SourceSelector and handles confirm/cancel logic.
- **`app/recipe/add.tsx`** — Screen entry point that wires up `onConfirm` to save the recipe.

## Analysis

**Current native (iOS) flow:**
1. User taps the `LiquidGlassSelect` trigger → picker modal slides up with a scrollable wheel of book names + "Add new" at the bottom
2. User scrolls to "Add new" in the picker wheel
3. User must tap the **"Done"** toolbar button to confirm the selection (`handlePickerDone`)
4. Modal closes, inline `LiquidGlassInput` appears for typing the new book name
5. User types the name and taps the confirm button

**Problem:** Step 3 is confusing. When the user scrolls to "Add new", they expect the book name input to appear immediately. Having to tap "Done" to confirm selection of a meta-action ("Add new" isn't really a source — it's a command) feels unintuitive. The task also suggests that clicking on *any* option should auto-confirm, eliminating the two-step modal interaction entirely.

**Web flow already works correctly:** `handleWebPickerChange` immediately acts on selection — no confirm step needed.

**Proposed approach:** Make the native picker auto-confirm when the user scrolls to any option. Specifically:
- When `tempValue` changes in the picker, auto-confirm after a short debounce (or immediately for "Add new")
- Alternatively (simpler): when `tempValue` changes to `ADD_NEW_VALUE`, immediately close the modal and show the input. For regular sources, keep the current Done/Cancel flow (or also auto-confirm).

The task title specifically says "the add book option, when it is clicked, should trigger the adding book form", and the description says "Maybe clicking on any option should confirm the choice?" — so the cleanest solution is to **auto-confirm all selections** from the picker, removing the Done/Cancel toolbar entirely.

## Steps

1. **In `SourceSelector.tsx`, replace the `onValueChange` handler on the native `Picker` to auto-confirm selections**

   Replace `onValueChange={setTempValue}` (line 241) with a new handler that:
   - If the new value is `ADD_NEW_VALUE`: immediately close the modal and set `isEditingNewSource = true`
   - If the new value is a real source ID: immediately close the modal and call `onValueChange(itemValue, false)`

   ```typescript
   const handleNativePickerChange = useCallback(
     (itemValue: string) => {
       setTempValue(itemValue);
       setPickerModalVisible(false);
       if (itemValue === ADD_NEW_VALUE) {
         setIsEditingNewSource(true);
       } else if (itemValue) {
         onValueChange(itemValue, false);
       }
     },
     [onValueChange]
   );
   ```

2. **Remove the Done/Cancel toolbar from the picker modal**

   Delete the `pickerToolbar` View (lines 222-237) since selections are now instant. Keep only the backdrop press as a cancel mechanism.

3. **Remove now-unused code**
   - Remove `handlePickerDone` callback (lines 82-89)
   - Remove `handlePickerCancel` callback (lines 91-94) — replace `onRequestClose` with a simple inline close handler
   - Remove `pickerToolbar`, `pickerToolbarButton`, `pickerToolbarButtonDone` styles
   - Simplify: the `tempValue` state may still be needed to track the picker's selected value, but the Done/Cancel flow is gone

4. **Keep the backdrop cancel behavior**

   When tapping the backdrop overlay, just close the modal without changing the selection (current `handlePickerCancel` behavior, inlined):
   ```typescript
   const handlePickerClose = useCallback(() => {
     setPickerModalVisible(false);
     setTempValue(value);
   }, [value]);
   ```

## Testing

- **iOS native:** Open the add recipe screen → tap the source selector → the picker wheel slides up **without** a toolbar. Scroll to "Add new" → modal immediately closes and the text input appears. Scroll to an existing book → modal immediately closes and that book is selected.
- **Web:** Verify the existing `handleWebPickerChange` behavior is unchanged — selecting "Add new" from the dropdown immediately shows the input.
- **Backdrop dismiss:** Open the picker, don't change the selection, tap the dark backdrop → modal closes with no change.
- **Edge case:** If there are no sources, the inline input should still show directly (existing `hasNoSources` logic, unchanged).
- **Full flow:** Select "Add new" → type a book name → tap confirm → recipe saves with the new source.

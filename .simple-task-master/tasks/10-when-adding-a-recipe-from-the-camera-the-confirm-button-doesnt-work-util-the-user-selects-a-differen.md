---
schema: 1
id: 10
title: When adding a recipe from the camera, the confirm button doesn't work util the user selects a different book - the default doesn't work, while it does for a photo taken from the library
status: planned
created: "2026-03-12T22:44:47.958Z"
updated: "2026-03-12T22:44:47.958Z"
tags:
  - ux
  - bug
dependencies: []
---

## Implementation Plan

## Relevant Files

- **`app/recipe/add.tsx`** — Screen component; initializes `source` state as `""` and passes `setSource` down. This is where the fix should go.
- **`features/source-selector/components/SourceSelector.tsx`** — Contains a `useEffect` (lines 59-66) that auto-selects the last-used source when `value` is empty. This is the current auto-selection mechanism.
- **`features/recipe-form/components/AddRecipeForm.tsx`** — Intermediary; passes `source`/`onSourceChange` through to SourceSelector and controls confirm button disabled state.
- **`features/recipe-import/components/ConfirmButton.tsx`** — The confirm button; `disabled` prop only guards the `handlePress` callback but is NOT passed to `LiquidGlassButton`.
- **`features/sources/context/SourcesContext.tsx`** — Provides `getLastUsed()` which returns the most recently used source within 24 hours.
- **`features/photos/hooks/usePhotoImport/index.native.ts`** — Both camera and library flows; identical navigation via `router.push({ pathname: "/recipe/add", params: { uri } })`.

## Analysis

Both camera and library flows navigate identically to `/recipe/add` with a URI param. The source (book) auto-selection relies on a `useEffect` inside `SourceSelector` (line 59-66) that checks if `value` is empty and, if so, calls `onValueChange(lastUsed.id, true)` to set the default.

The problem: when returning from the **camera**, the app transitions from background to foreground. During this iOS lifecycle transition, React may batch or defer the useEffect's state update (`setSource`) in a way that leaves the parent's `source` state at `""` even though the SourceSelector visually shows a selected book. The `handleConfirm` callback in `add.tsx` captures `source` in its closure — if `source` is still `""`, the guard `if (!uri || !effectiveSource) return` silently aborts.

With **library**, the system photo picker is presented as an in-app sheet (iOS 14+), so the app doesn't go to background. The useEffect fires normally and the state propagates correctly.

The fix is to initialize `source` with the last-used source **synchronously during state initialization** in `add.tsx`, eliminating dependence on the SourceSelector's useEffect timing. The useEffect becomes a harmless no-op since `!value` will be `false` from the first render.

## Steps

1. **In `app/recipe/add.tsx`**: Import `useSources` (already imported) and destructure `getLastUsed` alongside `touchSource`. Change the `source` state initialization from:
   ```tsx
   const [source, setSource] = useState<SourceId>("");
   ```
   to:
   ```tsx
   const { touchSource, getLastUsed } = useSources();
   const [source, setSource] = useState<SourceId>(() => {
     const lastUsed = getLastUsed();
     return lastUsed ? lastUsed.id : "";
   });
   ```
   This sets the default book on the very first render, before any effects run.

2. **Verify SourceSelector's useEffect is harmless**: With `source` already set to the last-used ID, the SourceSelector receives a non-empty `value` on mount. The useEffect's `if (!value)` guard prevents it from re-setting, so no double-update or conflict occurs. No changes needed in SourceSelector.

3. **No changes needed in AddRecipeForm or ConfirmButton**: The confirm button's `disabled={!isEditingSource && !source}` will correctly evaluate to `false` (enabled) from the first render when a default source exists. The `handleConfirm` callback will have the correct `source` in its closure.

## Testing

1. **Camera flow with existing books**: Take a photo via camera. Verify the last-used book is pre-selected AND the confirm button works on first tap without changing the book.
2. **Library flow with existing books**: Import from library. Verify the same default selection and confirm behavior (regression check).
3. **No books exist**: Both camera and library should show the "add new source" input field and confirm should work after typing a name.
4. **No recent book (>24h)**: Verify both flows show no pre-selection and require manual book selection.
5. **Switching books**: After auto-selection, manually switch to a different book and confirm. Verify the manually selected book is used.

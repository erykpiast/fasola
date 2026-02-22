# Task Breakdown: Manage Recipe Books

Generated: 2026-02-22
Source: specs/016_manage_books/spec.md

## Overview

Promote recipe sources from bare strings to UUID-based entities. Build a manage-books screen with swipe gestures (delete/rename), an add-book flow, and a three-dots overflow menu on the recipe list screen. 11 tasks across 5 phases.

## Dependency Graph

```
T1 ──→ T2 ──→ T4 ──→ T7 ──→ T8
  │      │              │      │
  │      ├──→ T5 ──→ T7 ├──→ T9
  │      │              │
  │      └──→ T6        └──→ T11
  │                            ↑
  └──→ T3                    T10
       (parallel)       (parallel from start)
```

- **T4, T5, T6** can run in parallel (all depend on T2)
- **T8, T9** can run in parallel (both depend on T7)
- **T10** has no dependencies — can start immediately, in parallel with everything
- **T11** depends on T7 + T10

## Phase 1: Source Entity + Context

### Task 1: Source Types + SourceRepository
**Size**: Medium
**Priority**: High
**Dependencies**: None
**Can run parallel with**: T10

**Files to create/modify**:
- `lib/types/primitives.ts` — add `SourceId` type alias
- `lib/types/source.ts` — **new file**, `Source` interface
- `lib/repositories/sources.ts` — **new file**, `SourceRepository` class (replaces `sourceHistory.ts`)

**Implementation**:

1. Add to `lib/types/primitives.ts`:
```typescript
export type SourceId = string;
```

2. Create `lib/types/source.ts`:
```typescript
import type { SourceId } from "./primitives";

export interface Source {
  id: SourceId;
  name: string;
  lastUsedAt: number;
}
```

3. Create `lib/repositories/sources.ts` — full `SourceRepository` with these methods:
   - `getAll()` — returns all sources sorted by `lastUsedAt` desc
   - `getById(id)` — find by ID or return null
   - `create(name)` — validates non-empty/non-duplicate (case-insensitive), generates UUID via `Crypto.randomUUID()`
   - `rename(id, newName)` — validates non-empty/non-duplicate (excluding self), updates name
   - `delete(id)` — removes entity from array
   - `touch(id)` — updates `lastUsedAt` to `Date.now()`
   - `getLastUsed()` — returns most recent source if within 24 hours, else null

   Storage key: `@sources`. Uses same `storage` import pattern as existing `sourceHistory.ts`.

   Validation rules:
   - `create` and `rename` trim input, reject empty/whitespace-only
   - `create` and `rename` reject case-insensitive duplicate names (throw `Error`)
   - `rename` excludes the source being renamed from duplicate check

**Acceptance Criteria**:
- [ ] `SourceId` type exported from `primitives.ts`
- [ ] `Source` interface exported from `source.ts`
- [ ] `SourceRepository` passes all unit tests:
  - `create`: entity has UUID, trimmed name, current timestamp
  - `create` with empty/whitespace name: throws
  - `create` with duplicate name (case-insensitive): throws
  - `rename`: name changes, id and lastUsedAt preserved
  - `rename` with empty name: throws
  - `rename` with duplicate name: throws
  - `rename` non-existent id: no-op
  - `delete`: entity removed from storage
  - `delete` non-existent id: no-op
  - `getById`: returns correct entity or null
  - `touch`: lastUsedAt updated, name unchanged
  - `getLastUsed`: returns most recent within 24h, null otherwise
  - `getAll`: sorted by lastUsedAt descending

---

### Task 2: SourcesContext + useSourceName + Layout Wiring
**Size**: Large
**Priority**: High
**Dependencies**: T1
**Can run parallel with**: T3 (after T1 completes)

**Files to create/modify**:
- `features/sources/context/SourcesContext.tsx` — **new file**
- `features/sources/hooks/useSourceName.ts` — **new file**
- `app/_layout.tsx` — add `SourcesProvider` to provider chain

**Implementation**:

1. Create `features/sources/context/SourcesContext.tsx`:

   Context value type:
   ```typescript
   type SourcesContextValue = {
     sources: Array<Source>;
     getSourceName: (id: SourceId) => string | undefined;
     createSource: (name: string) => Promise<Source>;
     renameSource: (id: SourceId, newName: string) => Promise<void>;
     deleteSource: (id: SourceId) => Promise<void>;
     touchSource: (id: SourceId) => Promise<void>;
     getLastUsed: () => Source | null;
     refresh: () => Promise<void>;
   };
   ```

   Follow `RecipesContext.tsx` pattern exactly:
   - React 19 `use()` for initial data fetch from `sourceRepository.getAll()`
   - `useState<Array<Source>>` holds in-memory copy
   - Each CRUD method: calls repository method, then updates local state (re-fetches or optimistically mutates)
   - `getSourceName(id)`: synchronous lookup — `sources.find(s => s.id === id)?.name`
   - `getLastUsed()`: synchronous — finds most recent from in-memory array, checks 24h window

   Export `useSources()` hook with context guard:
   ```typescript
   export function useSources(): SourcesContextValue {
     const ctx = useContext(SourcesContext);
     if (!ctx) throw new Error("useSources must be used within SourcesProvider");
     return ctx;
   }
   ```

2. Create `features/sources/hooks/useSourceName.ts`:
   ```typescript
   export function useSourceName(source: string | undefined): {
     displayName: string | undefined;
     isUrl: boolean;
   } {
     const { getSourceName } = useSources();
     if (!source) return { displayName: undefined, isUrl: false };
     if (isUrl(source)) return { displayName: source, isUrl: true };
     return { displayName: getSourceName(source), isUrl: false };
   }
   ```
   Uses `isUrl()` from `lib/utils/recipeValidation.ts`.

3. Add `SourcesProvider` to `app/_layout.tsx` provider chain — wraps `RecipesProvider`:
   ```
   DebugProvider
     SourcesProvider           ← new
       RecipesProvider
         ICloudSyncProvider
           ...
   ```

**Acceptance Criteria**:
- [ ] `SourcesProvider` loads sources on mount via `use()` pattern
- [ ] `useSources()` throws outside provider
- [ ] `getSourceName` resolves SourceId → name synchronously
- [ ] `getLastUsed` returns correct source or null synchronously
- [ ] CRUD methods update both repository and in-memory state
- [ ] `useSourceName` returns `{ displayName, isUrl }` correctly for: SourceId, URL, undefined, unknown ID
- [ ] Provider chain in `_layout.tsx` has `SourcesProvider` wrapping `RecipesProvider`
- [ ] App still boots and renders recipe grid

---

### Task 3: i18n Keys + Old File Cleanup
**Size**: Small
**Priority**: Medium
**Dependencies**: T1
**Can run parallel with**: T2

**Files to modify/delete**:
- `platform/i18n/translations/en.json` — add keys
- `lib/repositories/sourceHistory.ts` — **delete**
- `features/source-selector/hooks/useSourceHistory.ts` — **delete**

**Implementation**:

1. Add to `en.json`:
   ```json
   {
     "menu": {
       "manageBooks": "Manage Books"
     },
     "manageBooks": {
       "title": "Manage Books",
       "addBook": "Add Book",
       "emptyState": "No books yet",
       "recipeCount_one": "{{count}} recipe",
       "recipeCount_other": "{{count}} recipes",
       "back": "Back",
       "deleteConfirmTitle": "Delete \"{{name}}\"?",
       "deleteConfirmMessage": "This cannot be undone. All {{count}} recipes imported from this book will be permanently removed.",
       "deleteConfirmCancel": "Cancel",
       "deleteConfirmAction": "Delete"
     }
   }
   ```
   Note: `recipeCount_one` / `recipeCount_other` uses i18next plural convention.

2. Delete `lib/repositories/sourceHistory.ts`
3. Delete `features/source-selector/hooks/useSourceHistory.ts`

   **Important**: Deleting these files will break consumers (SourceSelector, add.tsx) until Phase 2 tasks complete. This is expected — T4 and T5 fix the breakage. If you prefer, delay deletion to after T4/T5. But the spec says Phase 1 includes deletion, so proceed.

**Acceptance Criteria**:
- [ ] All `menu.*` and `manageBooks.*` keys present in `en.json`
- [ ] Plural keys use `_one`/`_other` suffix (not `_plural`)
- [ ] `sourceHistory.ts` and `useSourceHistory.ts` deleted
- [ ] No other files import from the deleted paths (verified by grep — breakages are expected and fixed in T4/T5)

---

## Phase 2: Migrate Consumers

### Task 4: Migrate SourceSelector to Entity-Based
**Size**: Large
**Priority**: High
**Dependencies**: T2, T3
**Can run parallel with**: T5, T6

**Files to modify**:
- `features/source-selector/components/SourceSelector.tsx`

**Implementation**:

Current state: `SourceSelector` uses `useSourceHistory()` to get `sources: Array<SourceHistoryEntry>` (where entry is `{ source: string; lastUsedAt: number }`). Props: `value: string`, `onValueChange(source: string, isAutomatic?: boolean)`.

Changes:
- Replace `useSourceHistory()` with `useSources()` from context
- Picker values change from source name strings to `SourceId` strings
- Picker labels display `source.name` (resolved from entity)
- `onValueChange` callback now emits `SourceId` instead of name string
- Props type change: `value: SourceId`, `onValueChange(sourceId: SourceId, isAutomatic?: boolean)`
- "Add Book" flow: calls `createSource(name)` from context, emits `source.id`
- `SourceSelectorRef.confirmNewSource()` return type: `Promise<SourceId | undefined>` (was `Promise<string | undefined>`)
  - Internally calls `createSource(name)`, returns `source.id`
- `getLastUsed()` from context replaces the old `lastUsed` string

**Acceptance Criteria**:
- [ ] SourceSelector works with `Source` entities
- [ ] Picker shows `source.name` labels, emits `source.id` values
- [ ] "Add Book" creates entity via `createSource`, returns `SourceId`
- [ ] `confirmNewSource()` returns `SourceId`
- [ ] No imports from deleted `useSourceHistory`
- [ ] TypeScript compiles without errors

---

### Task 5: Migrate AddRecipeForm + AddRecipeScreen + RecipesContext
**Size**: Medium
**Priority**: High
**Dependencies**: T2, T3
**Can run parallel with**: T4, T6

**Files to modify**:
- `features/recipe-form/components/AddRecipeForm.tsx`
- `features/recipe-form/hooks/useRecipeForm.ts`
- `app/recipe/add.tsx`
- `features/recipes-list/context/RecipesContext.tsx`
- `lib/repositories/recipes.ts`
- `lib/repositories/types.ts`

**Implementation**:

1. `RecipesContext.tsx` — `savePending` signature: `source?: SourceId` (was `string`)
2. `lib/repositories/types.ts` — `savePending` in `RecipeRepository` interface: `source?: SourceId`
3. `lib/repositories/recipes.ts` — `savePending` implementation accepts `SourceId`
4. `AddRecipeForm.tsx` — `source` prop type: `SourceId` (was `string`), `onSourceChange(source: SourceId, ...)`
5. `useRecipeForm.ts` — `source` field stores `SourceId`
6. `app/recipe/add.tsx`:
   - Remove direct `import { sourceHistoryRepository }` — use `useSources().touchSource(id)` instead
   - `source` state type: `SourceId`
   - After saving: `await touchSource(sourceId)` instead of `await sourceHistoryRepository.addSource(name)`

**Acceptance Criteria**:
- [ ] `savePending` accepts `SourceId` throughout the chain
- [ ] `add.tsx` has no direct repository imports for sources
- [ ] `touchSource` called after recipe save to update lastUsedAt
- [ ] Importing a recipe with a source works end-to-end (source entity referenced by ID)
- [ ] TypeScript compiles without errors

---

### Task 6: Migrate Display Components (SourceDisplay + MetadataOverlay)
**Size**: Small
**Priority**: Medium
**Dependencies**: T2
**Can run parallel with**: T4, T5

**Files to modify**:
- `lib/components/atoms/SourceDisplay.tsx`
- `features/recipe-preview/components/MetadataOverlay.tsx`

**Implementation**:

1. `SourceDisplay.tsx`:
   - Currently receives `source?: string` and renders it directly (with URL hostname extraction)
   - Add `useSourceName(source)` call at the top
   - If `isUrl`: render hostname as before
   - If not URL: render `displayName` (resolved entity name) instead of raw source string
   - If `displayName` is undefined (unknown SourceId): render nothing or fallback

2. `MetadataOverlay.tsx`:
   - Currently renders `metadata.source` directly as text
   - Add `useSourceName(metadata.source)` call
   - Render `displayName` instead of raw `metadata.source`

**Acceptance Criteria**:
- [ ] SourceDisplay resolves SourceId to book name before rendering
- [ ] SourceDisplay still handles URLs (renders hostname with link)
- [ ] MetadataOverlay resolves SourceId to book name
- [ ] Unknown SourceId does not crash (renders nothing or falls back gracefully)
- [ ] No visual change for URL-type sources

---

## Phase 3: Manage Books Screen

### Task 7: Manage Books Screen (List + Bottom Bar + Add Mode + Empty State)
**Size**: Large
**Priority**: High
**Dependencies**: T4, T5
**Can run parallel with**: T10

**Files to create/modify**:
- `app/manage-books.tsx` — **new file**
- `features/recipe-form/components/MetadataFormFields.tsx` — update source display

**Implementation**:

1. Create `app/manage-books.tsx` — expo-router route.

   Layout (ASCII from spec):
   ```
   ┌──────────────────────────────────┐
   │           Manage Books           │
   ├──────────────────────────────────┤
   │  Grandma's Cookbook               │
   │  12 recipes                      │
   │──────────────────────────────────│
   │  Italian Classics                │
   │  5 recipes                       │
   │──────────────────────────────────│
   │                                  │
   │  (←)                       (+)   │
   └──────────────────────────────────┘
   ```

   **Recipe count derivation**:
   ```typescript
   const recipeCounts = useMemo(() => {
     const counts = new Map<SourceId, number>();
     for (const recipe of recipes) {
       const src = recipe.metadata.source;
       if (src && !isUrl(src)) {
         counts.set(src, (counts.get(src) ?? 0) + 1);
       }
     }
     return counts;
   }, [recipes]);
   ```

   **List item**: Book title (multiline), recipe count subtitle (`t("manageBooks.recipeCount", { count })` with i18next pluralization), horizontal separator (`StyleSheet.hairlineWidth`).

   **Bottom bar**: Absolutely positioned. Two `LiquidGlassButton`:
   - Left: `chevron.left` SF Symbol → `router.back()`
   - Right: `plus` SF Symbol → enters add-book mode

   **Add-book mode**: Plus button morphs to checkmark, back button morphs to cancel (xmark), glass text input appears between them. Uses `LiquidGlassInput`. Checkmark/Return → `createSource(name)`, cancel/xmark → discard.

   **Empty state**: Centered "No books yet" text when `sources.length === 0`. Bottom bar still visible.

2. Update `MetadataFormFields.tsx` — source display uses resolved name (if SourceSelector already emits SourceId from T4, this may just work; verify the label rendering).

**Acceptance Criteria**:
- [ ] Route `/manage-books` renders the screen
- [ ] Sources listed with name and recipe count
- [ ] Multiline book names wrap correctly
- [ ] Back button navigates to recipe list
- [ ] Plus button enters add-book mode
- [ ] Add-book mode: type name + checkmark → source created, appears in list with "0 recipes"
- [ ] Add-book mode: cancel → nothing created, bar reverts
- [ ] Empty state shows "No books yet"
- [ ] List scrolls when content exceeds viewport

---

## Phase 4: Swipe Gestures

### Task 8: Swipeable Row + Delete Gesture
**Size**: Large
**Priority**: High
**Dependencies**: T7
**Can run parallel with**: T9

**Files to create/modify**:
- `app/manage-books.tsx` — add swipeable row component (can be extracted to a component file in `features/sources/components/` if needed)

**Implementation**:

Build a swipeable row using `Gesture.Pan` from `react-native-gesture-handler` + `react-native-reanimated` animated values.

**Swipe left → delete**:
- `Gesture.Pan` with `onUpdate` driving a `translateX` shared value (clamped: cannot swipe right past 0 in delete mode)
- Red background strip on right side with white trash icon (`trash` SF Symbol)
- Item content translates left proportionally
- Threshold: 80pt
- Below threshold on gesture end: spring back via `withSpring`
- Above threshold on gesture end: spring back to resting, then show confirmation `Alert`

**Confirmation dialog**:
```typescript
Alert.alert(
  t("manageBooks.deleteConfirmTitle", { name: source.name }),
  t("manageBooks.deleteConfirmMessage", { count: recipeCounts.get(source.id) ?? 0 }),
  [
    { text: t("manageBooks.deleteConfirmCancel"), style: "cancel" },
    {
      text: t("manageBooks.deleteConfirmAction"),
      style: "destructive",
      onPress: () => handleDeleteBook(source.id),
    },
  ]
);
```

**Delete cascade** (orchestrated at screen level):
```typescript
const handleDeleteBook = useCallback(async (sourceId: SourceId) => {
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  // Animate row offscreen
  rowHeight.value = withTiming(0, { duration: 300 });
  // Delete all recipes referencing this source
  const recipesToDelete = recipes.filter((r) => r.metadata.source === sourceId);
  await Promise.all(recipesToDelete.map((r) => deleteRecipe(r.id)));
  // Delete the source entity
  await deleteSource(sourceId);
}, [recipes, deleteRecipe, deleteSource]);
```

`runOnJS` callback triggers the confirmation dialog from the gesture handler worklet.

**Acceptance Criteria**:
- [ ] Swipe left reveals red trash background
- [ ] Below 80pt threshold: springs back
- [ ] Above 80pt threshold: springs back, shows confirmation dialog with book name and recipe count
- [ ] "Cancel" dismisses dialog, no action
- [ ] "Delete" fires haptic, animates row away, deletes source + all its recipes
- [ ] Recipe photos and thumbnails cleaned up (via existing `deleteRecipe` cascade)

---

### Task 9: Swipe Right → Edit with Inline Mode
**Size**: Large
**Priority**: High
**Dependencies**: T7
**Can run parallel with**: T8

**Files to modify**:
- `app/manage-books.tsx` (or extracted swipeable row component)

**Implementation**:

**Swipe right → edit**:
- Blue background strip on left side with white pencil icon (`pencil` SF Symbol)
- Threshold: 80pt
- Below threshold: spring back
- Above threshold: enter edit mode

**Edit mode**:
1. Title text becomes `TextInput` (pre-filled with current title, auto-focused, text selected)
2. Left action icon changes from pencil to checkmark (`checkmark` SF Symbol)
3. Recipe count subtitle remains visible, non-editable
4. Confirm edit: tap checkmark OR press Return/Done on keyboard → `renameSource(source.id, newName)`, exit edit mode
5. Cancel edit: swipe right again OR tap outside → restore original title, exit edit mode
6. Only one item editable at a time — entering edit on another item cancels current edit

**State management**:
- `editingSourceId: SourceId | null` state on the screen component
- When entering edit mode: set `editingSourceId` to the source's ID
- When confirming/cancelling: set to `null`
- Each row checks `editingSourceId === source.id` to decide render mode

**Validation**: `renameSource` in repository already rejects empty/duplicate names. Catch the error and show it (or silently revert).

**Acceptance Criteria**:
- [ ] Swipe right reveals blue pencil background
- [ ] Above threshold: enters edit mode with auto-focused TextInput
- [ ] Checkmark confirms rename
- [ ] Return/Done key confirms rename
- [ ] Swipe right again cancels edit
- [ ] Tap outside cancels edit
- [ ] Only one row editable at a time
- [ ] Duplicate name error handled gracefully (revert or show message)

---

## Phase 5: Overflow Menu

### Task 10: LiquidGlass Anchor Prop (Native + TypeScript)
**Size**: Medium
**Priority**: Medium
**Dependencies**: None (can start immediately)
**Can run parallel with**: All Phase 1-4 tasks

**Files to modify**:
- `modules/liquid-glass/ios/LiquidGlassPopoverView.swift`
- `modules/liquid-glass/ios/LiquidGlassModule.swift`
- `modules/liquid-glass/src/LiquidGlassPopover.types.ts`
- `modules/liquid-glass/src/LiquidGlassPopover.ios.tsx`
- `modules/liquid-glass/src/LiquidGlassPopover.tsx`

**Implementation**:

1. **TypeScript types** (`LiquidGlassPopover.types.ts`):
   Add `anchor?: "bottomTrailing" | "topTrailing"` and `buttonOffset?: { x: number; y: number }` to `LiquidGlassPopoverProps`. Default anchor: `"bottomTrailing"`. Default buttonOffset: `{ x: 28, y: 28 }`. Caller provides safe area insets via `buttonOffset.y`.

2. **iOS pass-through** (`LiquidGlassPopover.ios.tsx`):
   Pass `anchor` prop to `NativeLiquidGlassPopoverView`.

3. **Non-iOS fallback** (`LiquidGlassPopover.tsx`):
   Use `anchor` to position the fallback menu (top-right vs bottom-right).

4. **Native prop registration** (`LiquidGlassModule.swift`):
   Register both `anchor` and `buttonOffset` props. `buttonOffset` is a `[String: CGFloat]` dict with `x`/`y` keys.

5. **SwiftUI layout** (`LiquidGlassPopoverView.swift`):
   - Add `buttonOffsetX: CGFloat = 28` and `buttonOffsetY: CGFloat = 28` properties
   - `setButtonOffset` method parses `{ "x": N, "y": N }` dict
   - Replace hardcoded padding with `buttonOffsetX`/`buttonOffsetY`
   - `"bottomTrailing"`: `.padding(.trailing, buttonOffsetX).padding(.bottom, buttonOffsetY)`
   - `"topTrailing"`: `.padding(.trailing, buttonOffsetX).padding(.top, buttonOffsetY)`
   - Delete `topSafeAreaInset` computed property — caller provides the full offset including safe area via `buttonOffset.y`

**Acceptance Criteria**:
- [ ] Existing bottom-trailing popover works unchanged (default anchor)
- [ ] `anchor="topTrailing"` positions popover at top-right
- [ ] Morph animation origin matches anchor position
- [ ] Non-iOS fallback positions menu correctly for both anchors
- [ ] TypeScript types include `anchor` prop
- [ ] No regression on existing source-selector popover

---

### Task 11: Three-Dots Overflow Menu on Recipe List
**Size**: Medium
**Priority**: Medium
**Dependencies**: T7, T10

**Files to modify**:
- `app/index.tsx`

**Implementation**:

1. Add a `LiquidGlassButton` in the top-right of the recipe list screen (absolute positioned, safe area inset):
   - SF Symbol: `ellipsis` (three dots)
   - Position: top-right, within safe area

2. Add state: `const [overflowVisible, setOverflowVisible] = useState(false)`

3. Add a second `LiquidGlassPopover` instance:
   ```typescript
   <LiquidGlassPopover
     visible={overflowVisible}
     anchor="topTrailing"
     buttonOffset={{ x: 28, y: insets.top + 8 }}
     options={[
       { id: "manage-books", label: t("menu.manageBooks"), systemImage: "books.vertical" }
     ]}
     buttonSize={44}
     onSelect={(id) => {
       setOverflowVisible(false);
       if (id === "manage-books") router.push("/manage-books");
     }}
     onDismiss={() => setOverflowVisible(false)}
   />
   ```

4. The button's `onPress` sets `overflowVisible = true` with haptic.

5. When the source-selector popover is visible, the overflow button should be non-interactive (and vice versa). Manage `pointerEvents` accordingly.

**Acceptance Criteria**:
- [ ] Three-dots button visible in top-right of recipe list
- [ ] Tap opens glass popover with "Manage Books" option
- [ ] Popover morphs from button (top-trailing anchor)
- [ ] Selecting "Manage Books" navigates to `/manage-books`
- [ ] Tapping outside dismisses popover
- [ ] Source-selector and overflow popovers don't conflict
- [ ] Haptic fires on button tap

---

## Execution Summary

| Phase | Tasks | Parallel Opportunities |
|-------|-------|----------------------|
| 1: Foundation | T1, T2, T3 | T3 parallel with T2 (after T1) |
| 2: Consumers | T4, T5, T6 | All three parallel (after T2) |
| 3: Screen | T7 | After T4, T5 |
| 4: Gestures | T8, T9 | Both parallel (after T7) |
| 5: Overflow | T10, T11 | T10 from start; T11 after T7+T10 |

**Total tasks**: 11
**Critical path**: T1 → T2 → T4/T5 → T7 → T8/T9 → T11
**Maximum parallelism**: 4 tasks (T4 + T5 + T6 + T10)

# Manage Recipe Books

**Status:** Draft
**Authors:** Claude, 2026-02-22

## Overview

A dedicated screen for managing recipe source books — rename, delete, and add. Accessible from a three-dots overflow menu in the top-right of the recipes list screen. The menu morphs from the button using the same glass morph pattern as the plus-button-to-source-selector transition.

This feature includes a data model change: sources become proper entities with stable IDs, so renaming a book is a single property change rather than a cascade across all referencing recipes.

## Background / Problem Statement

Sources (books) are currently bare strings. `RecipeMetadata.source` holds the book name directly, and `SourceHistoryEntry` is `{ source: string; lastUsedAt: number }`. This creates two problems:

1. **No management operations.** There is no way to rename, delete, or proactively create a book. `SourceHistoryRepository` only has `addSource` and `getRecentSources`.

2. **String identity is fragile.** With string-based identity, renaming a book would require rewriting every recipe that references the old name.

The fix: promote sources to first-class entities with UUIDs. Recipes reference sources by ID. Renaming changes one property on one entity. The app is pre-production, so this is a clean data model replacement with no migration needed.

## Goals

- Source entity with stable ID — recipes reference by ID, not name
- Full CRUD for source books: list, add, rename, delete
- Swipe-based interactions matching native iOS patterns (Reminders-style)
- Recipe count displayed per book
- Overflow menu on the recipe list screen (three-dots button, top-right) with morphing glass animation
- The menu initially has one item ("Manage Books"), designed to accommodate future items

## Non-Goals

- Reordering books (drag-to-reorder)
- Merging two books into one
- Bulk operations (select-all, bulk delete)
- Filtering the recipe grid by book from this screen (already possible via search)
- Managing URL-type sources (only plain-string book names; URLs stay as inline strings)
- Android/web implementation of the glass morph menu (fallback Modal is acceptable)

## Technical Dependencies

- `react-native-gesture-handler` 2.28.0 — `Gesture.Pan` for swipe detection
- `react-native-reanimated` 4.1.3 — animated swipe reveal, inline edit transitions
- `expo-router` 6.0.12 — new route for the manage-books screen
- `expo-crypto` (already installed) — UUID generation for source entity IDs
- `liquid-glass` native module — extended `LiquidGlassPopover` with configurable anchor position
- `expo-haptics` — haptic feedback on delete confirmation
- No new external dependencies required

## Detailed Design

### 1. Source Entity Model

#### New types

```typescript
// lib/types/primitives.ts
export type SourceId = string;
```

```typescript
// lib/types/source.ts (new file)
import type { SourceId } from "./primitives";

export interface Source {
  id: SourceId;
  name: string;
  lastUsedAt: number;
}
```

#### RecipeMetadata change

```typescript
// lib/types/recipe.ts
export interface RecipeMetadata {
  title?: string;
  source?: SourceId | `https://${string}` | `http://${string}`;
  tags: Array<`#${string}`>;
}
```

The `source` field is a union:
- **SourceId** (UUID) — references a `Source` entity. Used for book-type sources.
- **URL string** — `http://...` or `https://...`. Stored inline, not an entity. No management needed.

Detection uses the existing `isUrl()` helper in `lib/utils/recipeValidation.ts` — if the value starts with `http://` or `https://`, it's a URL; otherwise it's a `SourceId`.

### 2. Source Repository (replaces SourceHistoryRepository)

Rename `lib/repositories/sourceHistory.ts` → `lib/repositories/sources.ts`. The class becomes `SourceRepository`.

**Storage key:** `@sources` (new key, replaces `@sourceHistory`).

```typescript
// lib/repositories/sources.ts
import * as Crypto from "expo-crypto";
import type { SourceId } from "@/lib/types/primitives";
import type { Source } from "@/lib/types/source";

const SOURCES_KEY: StorageKey = "@sources";

class SourceRepository {
  async getAll(): Promise<Array<Source>> {
    const data = await storage.getItem(SOURCES_KEY);
    if (!data) return [];
    const sources: Array<Source> = JSON.parse(data);
    return sources.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  }

  async getById(id: SourceId): Promise<Source | null> {
    const sources = await this.getAll();
    return sources.find((s) => s.id === id) ?? null;
  }

  async create(name: string): Promise<Source> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Source name cannot be empty");
    const sources = await this.getAll();
    if (sources.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error("A book with this name already exists");
    }
    const newSource: Source = {
      id: Crypto.randomUUID(),
      name: trimmed,
      lastUsedAt: Date.now(),
    };
    sources.push(newSource);
    await storage.setItem(SOURCES_KEY, JSON.stringify(sources));
    return newSource;
  }

  async rename(id: SourceId, newName: string): Promise<void> {
    const trimmed = newName.trim();
    if (!trimmed) throw new Error("Source name cannot be empty");
    const sources = await this.getAll();
    if (sources.some((s) => s.id !== id && s.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error("A book with this name already exists");
    }
    const source = sources.find((s) => s.id === id);
    if (!source) return;
    source.name = trimmed;
    await storage.setItem(SOURCES_KEY, JSON.stringify(sources));
  }

  async delete(id: SourceId): Promise<void> {
    const sources = await this.getAll();
    const filtered = sources.filter((s) => s.id !== id);
    await storage.setItem(SOURCES_KEY, JSON.stringify(filtered));
  }

  async touch(id: SourceId): Promise<void> {
    const sources = await this.getAll();
    const source = sources.find((s) => s.id === id);
    if (!source) return;
    source.lastUsedAt = Date.now();
    await storage.setItem(SOURCES_KEY, JSON.stringify(sources));
  }

  async getLastUsed(): Promise<Source | null> {
    const sources = await this.getAll();
    if (sources.length === 0) return null;
    const mostRecent = sources[0]; // already sorted by lastUsedAt desc
    const isWithin24Hours = Date.now() - mostRecent.lastUsedAt < 24 * 60 * 60 * 1000;
    return isWithin24Hours ? mostRecent : null;
  }
}

export const sourceRepository = new SourceRepository();
```

Key differences from `SourceHistoryRepository`:
- Entities have `id` (UUID) and `name` (display string) — no longer identified by name
- `rename(id, newName)` changes one entity's name property. No cascade.
- `delete(id)` removes the entity. All recipes referencing the source are also deleted (see section 6, Swipe Left → Delete).
- `touch(id)` replaces the old `addSource()` behavior for existing sources (updates `lastUsedAt`)
- `create(name)` replaces `addSource()` for new sources (generates UUID)

### 3. SourcesProvider (Preloaded Context)

All sources are preloaded into a React context at startup for synchronous resolution everywhere in the app. This eliminates async lookups and prevents any flash of unresolved IDs.

```typescript
// features/sources/context/SourcesContext.tsx

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

**`getSourceName(id)`** does a synchronous lookup in the in-memory `sources` array. Returns `source.name` if found, `undefined` if not. No async, no storage reads.

**`getLastUsed()`** is computed synchronously from the in-memory `sources` array — finds the most recent entry and checks if it's within 24 hours. No async storage read needed since sources are already preloaded.

**Provider placement:** Added to `app/_layout.tsx` in the provider chain, wrapping `RecipesProvider` (sources must be available before recipes render):

```
GestureHandlerRootView
  Suspense
    DebugProvider
      SourcesProvider           ← new
        RecipesProvider
          ICloudSyncProvider
            BackgroundProcessingProvider
              Stack
```

Uses React 19's `use()` for initial data fetch (same pattern as `RecipesProvider`). Holds `sources` array in `useState`. CRUD methods update both the repository and local state.

**`useSources()` hook** — exported from the same file, wraps `useContext(SourcesContext)` with a guard:

```typescript
export function useSources(): SourcesContextValue {
  const ctx = useContext(SourcesContext);
  if (!ctx) throw new Error("useSources must be used within SourcesProvider");
  return ctx;
}
```

**`useSourceName` hook** (thin wrapper for convenience):

```typescript
// features/sources/hooks/useSourceName.ts
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

Synchronous. No effects, no state, no flicker.

**Components that use this:**
- `SourceDisplay` (`lib/components/atoms/SourceDisplay.tsx`) — recipe detail/preview
- `MetadataOverlay` (`features/recipe-preview/components/MetadataOverlay.tsx`) — recipe preview overlay

Both currently render `metadata.source` directly. With the entity model, they render the resolved `displayName`.

### 4. Source Selector Updates

The `SourceSelector` component and `useSourceHistory` hook currently deal in source name strings. They need to switch to `Source` entities.

**Delete `useSourceHistory` hook.** Its consumers switch to `useSources()` from `SourcesContext` directly. The context already provides `sources`, `createSource`, `touchSource`, `renameSource`, `deleteSource`, `getLastUsed`, and `getSourceName`.

**`SourceSelector` changes:**
- Picker values change from source name strings to `SourceId` strings
- `onValueChange` callback emits `SourceId` instead of name string
- Picker labels display `source.name`
- "Add Book" flow calls `createSource(name)` and emits the new entity's `id`
- `SourceSelectorRef.confirmNewSource()` return type changes from `Promise<string | undefined>` to `Promise<SourceId | undefined>` — internally calls `createSource(name)` and returns `source.id`. The parent `AddRecipeForm` receives a `SourceId` directly.

**`AddRecipeForm` and `AddRecipeScreen` changes:**
- `source` state changes from `string` (name) to `SourceId`
- `savePending(uri, sourceId)` passes the SourceId
- `sourceRepository.touch(sourceId)` replaces `sourceHistoryRepository.addSource(name)`

### 5. Manage Books Screen

**Route:** `app/manage-books.tsx`

#### Layout

```
┌──────────────────────────────────┐
│           Manage Books           │
├──────────────────────────────────┤
│                                  │
│  Grandma's Cookbook               │
│  12 recipes                      │
│──────────────────────────────────│
│  Italian Classics                │
│  5 recipes                       │
│──────────────────────────────────│
│  Quick Weeknight                 │
│  Meals For The Whole Family      │  ← multiline title
│  3 recipes                       │
│──────────────────────────────────│
│                                  │
│                                  │
│                                  │
│                                  │
│  (←)                       (+)   │  ← bottom bar: back + add
└──────────────────────────────────┘
```

The bottom bar is absolutely positioned (same pattern as the recipe list screen's bottom bar). Two `LiquidGlassButton` instances:
- **Left**: back arrow (`chevron.left` SF Symbol) — calls `router.back()`
- **Right**: plus (`plus` SF Symbol) — enters add-book mode

#### Recipe Count Derivation

The screen loads recipes from `RecipesContext` and sources from `useSources`. For each source, count recipes where `recipe.metadata.source === source.id`:

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

#### List Item Structure

Each item renders:
- **Book title** — primary text, system font, standard body size. Multiline if long.
- **Recipe count** — secondary text, lighter color, smaller font. Format: `{n} recipe` / `{n} recipes`. Not editable even in edit mode.
- **Horizontal separator** — `StyleSheet.hairlineWidth` bottom border, standard iOS separator color.

#### Swipe Left → Delete

Swiping a list item left reveals a red background strip on the right side with a white trash icon (`trash` SF Symbol / `MaterialIcons.delete`). The item content translates left proportionally.

- Threshold: swipe past 80pt to trigger delete
- Below threshold: spring back to resting position
- Above threshold: the row springs back to resting position and a confirmation `Alert` appears

**Confirmation dialog:**

```
Delete "{book name}"?

This cannot be undone. All {n} recipes imported
from this book will be permanently removed.

[Cancel]  [Delete]
```

- "Cancel" dismisses the dialog, no action
- "Delete" triggers: haptic fires, the row animates offscreen, then the cascade executes

**Delete cascade orchestration:** The manage-books screen coordinates the deletion across both contexts. `SourcesProvider` wraps `RecipesProvider` in the provider hierarchy, so `SourcesContext` cannot access `RecipesContext`. Therefore the screen component (which has access to both) runs the cascade:

```typescript
// In app/manage-books.tsx
const { deleteRecipe, recipes } = useRecipes();
const { deleteSource } = useSources();

const handleDeleteBook = useCallback(async (sourceId: SourceId) => {
  // 1. Delete all recipes referencing this source
  const recipesToDelete = recipes.filter((r) => r.metadata.source === sourceId);
  await Promise.all(recipesToDelete.map((r) => deleteRecipe(r.id)));
  // 2. Delete the source entity
  await deleteSource(sourceId);
}, [recipes, deleteRecipe, deleteSource]);
```

`RecipesContext.deleteRecipe` already handles photo and thumbnail cleanup via `recipeRepository.delete` → `storage.deletePhoto` + `storage.deleteThumbnail`.

Implementation: `Gesture.Pan` with `onUpdate` driving a `translateX` shared value. `runOnJS` callback triggers the confirmation dialog when the gesture ends past threshold. The actual deletion happens only after user confirms.

#### Swipe Right → Edit

Swiping right reveals a blue background strip on the left side with a white pencil icon (`pencil` SF Symbol / `MaterialIcons.edit`).

- Threshold: swipe past 80pt to enter edit mode
- Below threshold: spring back

Once in edit mode:
1. The title text becomes an editable `TextInput` (pre-filled with current title, auto-focused, text selected)
2. The left action icon changes from pencil to checkmark (`checkmark` SF Symbol / `MaterialIcons.check`)
3. The recipe count subtitle remains visible and non-editable
4. Tapping the checkmark button confirms the edit → calls `renameSource(source.id, newName)`, exits edit mode
5. Swiping right again (or tapping outside) cancels the edit → restores original title, exits edit mode
6. Pressing Return/Done on the keyboard also confirms the edit

Only one item can be in edit mode at a time. Entering edit mode on one item cancels any other active edit.

#### Add Book

Tapping the plus button in the bottom-right enters add-book mode:

1. The plus button morphs into a text input field spanning the bottom bar (same glass input style as the source selector's "new book" flow). The back button on the left becomes a cancel (`xmark`) button.
2. A checkmark (`checkmark`) button appears on the right of the input.
3. User types the book name. Pressing Return or tapping the checkmark calls `createSource(name)` and exits add-book mode. The new source appears in the list with "0 recipes".
4. Tapping the cancel button (or swiping down / tapping outside the input) discards and exits add-book mode.

This reuses the `LiquidGlassInput` component already used in the source selector's "Add Book" flow — same visual language for creating a source anywhere in the app.

#### Empty State

If no books exist, show centered text: "No books yet". The bottom bar with back and plus buttons remains visible.

### 6. Three-Dots Overflow Menu

#### Button Placement

Top-right corner of the recipe list screen (`app/index.tsx`), positioned in the safe area inset zone. Uses `LiquidGlassButton` with the `ellipsis` SF Symbol (three dots).

```
┌──────────────────────────────────┐
│                            (•••) │  ← glass button, top-right
│                                  │
│  ┌────┐ ┌────┐ ┌────┐           │
│  │    │ │    │ │    │           │
│  │    │ │    │ │    │  Recipe   │
│  └────┘ └────┘ └────┘  grid    │
│  ...                             │
```

#### Popover Menu

The button opens a `LiquidGlassPopover` that morphs from the button, anchored top-right instead of bottom-right. This requires extending the native `LiquidGlassPopoverView` with an `anchor` prop.

**New prop on `LiquidGlassPopoverView`:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `anchor` | `"bottomTrailing"` \| `"topTrailing"` | `"bottomTrailing"` | Corner from which the popover expands |
| `buttonOffset` | `{ x: number; y: number }` | `{ x: 28, y: 28 }` | Distance from trailing/anchor edges to the morphing button. Caller provides safe area insets. |

The existing plus-button popover uses `bottomTrailing` (current behavior, default). The new overflow menu uses `topTrailing`.

In SwiftUI, this changes:
- The padding edges (`.padding(.top, safeAreaInsets.top + 28)` instead of `.padding(.bottom, 28)` — trailing padding stays the same)
- The morph anchor point for the scale/expand animation (`.topTrailing` instead of `.bottomTrailing`)

**Menu options (initial):**

```typescript
[
  { id: "manage-books", label: t("menu.manageBooks"), systemImage: "books.vertical" }
]
```

Selecting "manage-books" navigates to `/manage-books` via `router.push`.

### 7. i18n Additions

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

### File Changes

| File | Change |
|------|--------|
| `lib/types/primitives.ts` | Add `SourceId` type alias |
| `lib/types/source.ts` | **New file** — `Source` interface |
| `lib/types/recipe.ts` | Document that `source` is now `SourceId \| URL` (type unchanged, semantics change) |
| `lib/repositories/sourceHistory.ts` → `lib/repositories/sources.ts` | **Rename + rewrite** — `SourceRepository` with `getAll`, `getById`, `create`, `rename`, `delete`, `touch`, `getLastUsed` |
| `lib/repositories/recipes.ts` | Update `savePending` to accept `SourceId`; remove any source-name logic |
| `lib/repositories/types.ts` | Update `savePending` signature: `source?: SourceId` |
| `features/sources/context/SourcesContext.tsx` | **New file** — `SourcesProvider` preloads all sources into context; exposes CRUD + synchronous `getSourceName` |
| `features/sources/hooks/useSourceName.ts` | **New file** — thin synchronous hook wrapping `SourcesContext.getSourceName` |
| `app/_layout.tsx` | Add `SourcesProvider` to provider chain (wraps `RecipesProvider`) |
| `lib/components/atoms/SourceDisplay.tsx` | Use `useSourceName` hook to resolve source before display |
| `features/recipe-preview/components/MetadataOverlay.tsx` | Use `useSourceName` hook to resolve source before display |
| `features/source-selector/hooks/useSourceHistory.ts` | **Delete** — replaced by `SourcesContext` |
| `features/source-selector/components/SourceSelector.tsx` | Work with `Source` entities and `SourceId` values instead of name strings |
| `features/recipe-form/components/AddRecipeForm.tsx` | `source` prop type: `SourceId` instead of `string` |
| `features/recipe-form/hooks/useRecipeForm.ts` | `source` field stores `SourceId` |
| `features/recipe-form/components/MetadataFormFields.tsx` | Source display uses resolved name |
| `features/recipes-list/context/RecipesContext.tsx` | `savePending` accepts `SourceId`; no `renameSource` needed (no cascade) |
| `app/recipe/add.tsx` | `source` state is `SourceId`; remove direct `sourceHistoryRepository` import; use `useSources().touchSource(id)` from context instead of `sourceHistoryRepository.addSource(name)` |
| `app/manage-books.tsx` | **New file** — manage books screen |
| `app/index.tsx` | Add three-dots button (top-right) and its popover |
| `modules/liquid-glass/ios/LiquidGlassPopoverView.swift` | Add `anchor` prop; adjust alignment/padding logic |
| `modules/liquid-glass/ios/LiquidGlassModule.swift` | Register `anchor` prop |
| `modules/liquid-glass/src/LiquidGlassPopover.types.ts` | Add `anchor?` prop type |
| `modules/liquid-glass/src/LiquidGlassPopover.ios.tsx` | Pass `anchor` prop to native view |
| `modules/liquid-glass/src/LiquidGlassPopover.tsx` | Handle `anchor` in fallback (position menu top-left vs bottom-right) |
| `platform/i18n/translations/en.json` | Add `menu` and `manageBooks` translation keys |

## User Experience

### Flow: Opening the Menu

1. User taps the three-dots button in the top-right of the recipe grid
2. Haptic fires. The button morphs into a glass panel listing "Manage Books"
3. The recipe grid and bottom bar remain visible underneath (the popover does not obscure much)
4. Tap "Manage Books" — the popover morphs back to the button, then navigates to the manage books screen
5. Tap outside — the popover dismisses via morph

### Flow: Renaming a Book

1. On the manage books screen, user swipes a book item to the right
2. A blue pencil icon is revealed on the left. Past the threshold, the item enters edit mode
3. The title becomes an editable text field (auto-focused, text selected)
4. The pencil icon becomes a checkmark
5. User edits the title, taps the checkmark (or presses Return)
6. `renameSource(source.id, newName)` updates the entity's `name` property. No recipe writes. Instant.
7. The item returns to display mode. All recipe displays referencing this source automatically show the new name on next render (they resolve `SourceId → name`).

### Flow: Deleting a Book

1. User swipes a book item to the left
2. A red trash icon is revealed on the right
3. Past the threshold, the row springs back and a confirmation dialog appears: "Delete '{name}'? This cannot be undone. All {n} recipes imported from this book will be permanently removed."
4. User taps "Delete" — haptic fires, the row animates offscreen, the source entity is deleted, and all recipes belonging to that source are deleted (photos + thumbnails cleaned from storage)
5. User taps "Cancel" — dialog dismisses, no action

### Flow: Adding a Book

1. User taps the plus button in the bottom-right of the manage books screen
2. The bottom bar transforms: the plus button becomes a checkmark, the back button becomes a cancel (xmark), and a glass text input appears between them
3. User types the book name, taps checkmark or presses Return
4. `createSource(name)` creates the entity. The bottom bar reverts. The new book appears in the list with "0 recipes"
5. Tapping cancel discards the input and reverts the bottom bar

## Testing Strategy

### Unit Tests

- `SourceRepository.create`: verify entity created with UUID, correct name and lastUsedAt
- `SourceRepository.rename`: verify name changes, id and lastUsedAt preserved
- `SourceRepository.rename` with non-existent id: no-op, no error
- `SourceRepository.delete`: verify entity removed
- `SourceRepository.delete` with non-existent id: no-op, no error
- `SourceRepository.getById`: returns correct entity or null
- `SourceRepository.touch`: verify lastUsedAt updated, name unchanged
- `SourceRepository.getLastUsed`: returns most recent within 24h, null otherwise
- `useSourceName` (synchronous): SourceId resolves to entity name; URL returns as-is; unknown id returns undefined
- Recipe count derivation: given N recipes with `source: id1` and M with `source: id2`, verify counts map
- Delete cascade: deleting a source also deletes all recipes with that `source` id

### Integration Tests

- Rename a book → navigate to recipe detail → verify resolved source name displayed
- Delete a book (confirm dialog) → verify book no longer in picker, all its recipes removed from grid
- Add a book → open source selector on new import → verify book appears in picker
- Fresh install (no migration needed) → create source → import recipe → verify round-trip

### Manual / iOS Simulator Testing

- Swipe left on item → trash icon visible → complete swipe → confirmation dialog appears with book name and recipe count → tap Delete → item removed with animation, recipes deleted
- Swipe left on item → complete swipe → confirmation dialog → tap Cancel → nothing happens, item stays
- Swipe right on item → pencil icon visible → complete swipe → edit mode activates
- Edit mode: type new name → tap checkmark → name persists after leaving and returning to screen
- Edit mode: swipe right again → edit cancelled, original name restored
- Tap plus button → bottom bar transforms to input → type name → tap checkmark → appears in list with "0 recipes"
- Tap plus button → tap cancel → bottom bar reverts, no book created
- Long book name wraps to multiple lines correctly
- List scrolls when many books present
- Three-dots button visible in top-right of recipe list → tap → morphing popover appears → "Manage Books" visible
- Select "Manage Books" → navigates to manage books screen
- Back button on manage books → returns to recipe list
- Verify haptic fires on delete completion and menu open

## Performance Considerations

- Rename is O(1) — single entity property change, single write to `@sources`. No recipe I/O.
- Source name resolution is synchronous — `SourcesProvider` preloads all sources into memory at startup. `useSourceName` does an in-memory array lookup. No async, no flicker.
- Delete is O(n) — deletes the source entity plus all referencing recipes (including photo/thumbnail cleanup). Acceptable at expected scale; the confirmation dialog provides natural latency cover.
- Recipe count computation is O(n) over recipes per render of the manage-books screen. Negligible at expected scale.
- The manage-books screen is a separate route — its component tree is not mounted when viewing the recipe grid.

## Security Considerations

None. All data is local. No network calls. No user-generated content rendered as HTML.

## Documentation

- Update `docs/architecture.md` to document the `Source` entity and the new route
- Update `docs/native-modules.md` to document the `anchor` prop on `LiquidGlassPopover`

## Implementation Phases

### Phase 1: Source Entity + Context

1. Add `SourceId` to `lib/types/primitives.ts`
2. Create `lib/types/source.ts` with `Source` interface
3. Create `lib/repositories/sources.ts` — `SourceRepository` with full CRUD
4. Create `features/sources/context/SourcesContext.tsx` — `SourcesProvider` with preloaded sources, CRUD, synchronous `getSourceName`
5. Create `features/sources/hooks/useSourceName.ts` — thin synchronous hook wrapping context
6. Add `SourcesProvider` to `app/_layout.tsx` provider chain
7. Add i18n translation keys (including delete confirmation strings)
8. Delete old `lib/repositories/sourceHistory.ts` and `features/source-selector/hooks/useSourceHistory.ts`

### Phase 2: Migrate Consumers

1. Update `SourceSelector` to use `useSources()` from context, work with `Source` entities (picker values are `SourceId`)
2. Update `AddRecipeForm` and `AddRecipeScreen` to pass `SourceId`
3. Update `RecipesContext.savePending` to accept `SourceId`
4. Update `SourceDisplay` and `MetadataOverlay` to use `useSourceName` hook
5. Update `MetadataFormFields` source display

### Phase 3: Manage Books Screen

1. Create `app/manage-books.tsx` with basic list (no swipe yet)
2. Derive recipe counts from `RecipesContext` using `SourceId` matching
3. Implement list item layout: title, recipe count, separator
4. Add bottom bar with back button (left) and plus button (right)
5. Implement add-book mode: bottom bar transforms to input + checkmark + cancel
6. Add empty state

### Phase 4: Swipe Gestures

1. Build swipeable row component using `Gesture.Pan` + Reanimated
2. Implement swipe-left delete action with threshold, animation, haptic
3. Implement swipe-right edit action with threshold and mode transition
4. Build inline edit mode: TextInput, checkmark confirm, swipe-right cancel
5. Ensure only one item editable at a time

### Phase 5: Overflow Menu

1. Add `anchor` prop to `LiquidGlassPopoverView.swift` — adjust alignment and padding based on anchor value
2. Register `anchor` prop in `LiquidGlassModule.swift`
3. Add `anchor` to TypeScript types and pass through in `.ios.tsx` and `.tsx` wrappers
4. Add three-dots `LiquidGlassButton` to `app/index.tsx` (top-right, absolute positioned in safe area)
5. Add second `LiquidGlassPopover` instance with `anchor="topTrailing"` and "Manage Books" option
6. Wire option select to `router.push("/manage-books")`

## Resolved Questions

1. **Delete confirmation**: Yes — a confirmation `Alert` warns that the action is irreversible and will permanently remove all recipes imported from that book. Delete only proceeds on explicit user confirmation.
2. **Orphaned source display**: Not applicable — deleting a book also deletes all its recipes. No orphaned references.
3. **Source name resolution latency**: Preloaded — `SourcesProvider` loads all sources into a React context at startup. Resolution is synchronous, no flicker.

## References

- `lib/types/primitives.ts` — semantic type aliases
- `lib/types/recipe.ts` — `RecipeMetadata.source` definition
- `lib/repositories/sourceHistory.ts` — current source storage (to be replaced)
- `lib/repositories/recipes.ts` — recipe repository with `savePending`
- `lib/repositories/types.ts` — `RecipeRepository` interface
- `lib/utils/recipeValidation.ts:62` — `isUrl()` helper used for source type detection
- `lib/components/atoms/SourceDisplay.tsx` — renders source name (needs resolution hook)
- `features/recipe-preview/components/MetadataOverlay.tsx` — renders source in preview
- `features/source-selector/components/SourceSelector.tsx` — source picker (needs entity migration)
- `features/source-selector/hooks/useSourceHistory.ts` — current source hook (to be replaced)
- `features/recipe-form/components/AddRecipeForm.tsx` — passes source during import
- `features/recipe-form/hooks/useRecipeForm.ts` — form state with source field
- `features/recipes-list/context/RecipesContext.tsx` — central recipe state
- `app/recipe/add.tsx` — add recipe screen with source selection
- `app/index.tsx` — recipe list screen (overflow menu goes here)
- `modules/liquid-glass/ios/LiquidGlassPopoverView.swift` — native popover to extend
- `specs/015_source_selector_animation/spec.md` — morph animation pattern

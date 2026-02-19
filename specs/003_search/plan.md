# Search Feature Implementation Plan

## Architecture Overview

### Module Boundaries

1. **Search UI Module** (`features/search/`)
   - Fixed-width search bar component (always visible)
   - Cancel button component (conditionally rendered)
   - Search focus state management

2. **Recipe Form Module** (`features/recipe-form/`)
   - Add Recipe button component (triggers photo import flow)
   - Conditionally rendered alongside Cancel button

3. **Recipe Filtering Logic** (`features/recipes-list/hooks/`)
   - Filtering algorithm
   - React 19 concurrent features (useDeferredValue, useTransition)

4. **Integration Layer** (`app/index.tsx`)
   - Connect search to RecipeGrid
   - Coordinate search focus state and button visibility

---

## File Structure

```
features/search/
├── components/
│   ├── SearchBar.tsx                 # Fixed search input with internal X button
│   └── CancelSearchButton.tsx        # Circular X button (bottom-right)
└── hooks/
    └── useSearchFocus.ts             # Focus state management

features/recipe-form/
└── components/
    └── AddRecipeButton.tsx           # Circular plus button (bottom-right, triggers photo import)

features/recipes-list/
├── hooks/
│   └── useRecipeFilter.ts            # Filtering logic with deferred rendering
└── utils/
    └── recipeSearch.ts               # Pure search/match functions
```

---

## Public APIs

### SearchBar Component
```typescript
// features/search/components/SearchBar.tsx
export function SearchBar(props: {
  value: string;
  onChangeText: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  isFocused: boolean;
}): JSX.Element
```

**Behavior:**
- Fixed width, always visible
- Internal X button (only visible when `value` is non-empty AND `isFocused` is true)
- X button clears text but doesn't change focus or dismiss keyboard
- Calls `onFocus` when TextInput focuses
- Calls `onBlur` when TextInput blurs

### AddRecipeButton Component
```typescript
// features/recipe-form/components/AddRecipeButton.tsx
export function AddRecipeButton(): JSX.Element
```

**Behavior:**
- Circular plus icon button
- Positioned at bottom-right
- Triggers photo import flow (no onPress prop needed, uses usePhotoImport internally)
- Replaces the old AddPhotoButton

### CancelSearchButton Component
```typescript
// features/search/components/CancelSearchButton.tsx
export function CancelSearchButton(props: {
  onPress: () => void;
}): JSX.Element
```

**Behavior:**
- Circular X icon button
- Positioned at bottom-right (same position as AddRecipeButton)
- Must match AddRecipeButton size and position exactly

### useSearchFocus Hook
```typescript
// features/search/hooks/useSearchFocus.ts
export function useSearchFocus(): {
  isFocused: boolean;
  handleFocus: () => void;
  handleBlur: () => void;
  handleCancel: () => void;  // clears text, dismisses keyboard, removes focus
}
```

### useRecipeFilter Hook
```typescript
// features/recipes-list/hooks/useRecipeFilter.ts
export function useRecipeFilter(recipes: Array<Recipe>): {
  filteredRecipes: Recipe[];
  isFiltering: boolean;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  clearSearch: () => void;
}
```

### Search Utility Functions
```typescript
// features/recipes-list/utils/recipeSearch.ts
export function filterRecipes(recipes: Recipe[], searchTerm: string): Recipe[]
```

---

## Implementation Phases

### Phase 1: Core Filtering Logic
**Files to create:**
- `features/recipes-list/utils/recipeSearch.ts`

**Implementation:**
- Pure function `filterRecipes(recipes, term)` using `@nozbe/microfuzz`
- Fuzzy search across title and tags
- Strips `#` prefix from tags for cleaner matching
- Returns filtered recipe array

**Dependencies:**
- `@nozbe/microfuzz` npm package

**Testing:** Can be unit tested in isolation

---

### Phase 2: React Hook with Concurrent Features
**Files to create:**
- `features/recipes-list/hooks/useRecipeFilter.ts`

**Implementation:**
- Hook that takes `recipes` array as input
- Internal state for `searchTerm`
- Use `useDeferredValue` for search term to defer filtering
- Use `useTransition` to mark filtering as non-blocking
- Return filtered recipes + loading state + search controls
- Memoize filtered results with `useMemo`

**Dependencies:** Phase 1

---

### Phase 3: Search UI Components
**Files to create:**
- `features/search/hooks/useSearchFocus.ts`
- `features/search/components/SearchBar.tsx`
- `features/search/components/CancelSearchButton.tsx`
- `features/recipe-form/components/AddRecipeButton.tsx` (replaces AddPhotoButton)

**Implementation:**

- **useSearchFocus.ts:**
  - State for `isFocused` (boolean)
  - `handleFocus()`: sets isFocused to true
  - `handleBlur()`: sets isFocused to false
  - `handleCancel()`: sets isFocused to false + triggers text clear + dismisses keyboard

- **SearchBar.tsx:**
  - Fixed-width text input with glass effect styling
  - Magnifying glass icon on the left (use `Ionicons` from `@expo/vector-icons`, icon name: `"search"`)
  - Small circular X button on the right (conditional: `value !== '' && isFocused`)
  - X button icon: use `Ionicons` from `@expo/vector-icons`, icon name: `"close-circle"`
  - X button press: calls `onChangeText('')` only (doesn't dismiss keyboard or change focus)
  - TextInput onFocus: calls `onFocus` prop
  - TextInput onBlur: calls `onBlur` prop
  - i18n support for placeholder text
  - Match glass effect styling

- **AddRecipeButton.tsx:**
  - Circular button with plus icon (use `Ionicons` from `@expo/vector-icons`, icon name: `"add"`)
  - Glass effect styling (56x56 points)
  - Uses `usePhotoImport` hook internally to trigger photo import flow
  - Replaces the old `AddPhotoButton` component

- **CancelSearchButton.tsx:**
  - Circular button with X icon (use `Ionicons` from `@expo/vector-icons`, icon name: `"close"`)
  - Glass effect styling (match AddRecipeButton)
  - Size: MUST exactly match AddRecipeButton size (56x56 points)
  - Position: MUST exactly match AddRecipeButton position

**Dependencies:**
- `@expo/vector-icons` (already in package.json)
- Use `Ionicons` for all icons (search, close-circle, add, close)

---

### Phase 4: Integration
**Files to modify:**
- `app/index.tsx`

**Files to remove:**
- `features/photos/components/AddPhotoButton.tsx` (replaced by AddRecipeButton)

**Implementation:**
- Import `useRecipeFilter` and `useSearchFocus` in Content component
- Replace `recipes` with `filteredRecipes` in RecipeGrid
- Create bottom bar container with:
  - Absolute positioning at bottom of screen
  - KeyboardAvoidingView wrapper
  - Horizontal flex layout with gap between search and action button
  - Proper margins from screen edges
- Add SearchBar component (left side of bottom bar)
  - Wire up to `searchTerm` and `setSearchTerm` from `useRecipeFilter`
  - Wire up to `isFocused`, `handleFocus`, `handleBlur` from `useSearchFocus`
- Conditionally render AddRecipeButton OR CancelSearchButton (right side of bottom bar)
  - Show AddRecipeButton when `!isFocused` (no onPress prop needed)
  - Show CancelSearchButton when `isFocused`
  - Both buttons in exact same position
- CancelSearchButton onPress: call `handleCancel()` + `clearSearch()`
- Remove old AddPhotoButton component

**Dependencies:** Phase 2, Phase 3

---

## Technical Notes

### React 19 Concurrent Features
- `useDeferredValue` keeps UI responsive during typing
- `useTransition` prevents blocking on large recipe lists
- Marks filtering operation as non-urgent
- Allows React to interrupt filtering for user input

### Layout and Positioning Strategy

**Bottom Bar Container:**
- Absolute positioning at bottom of screen
- Wrapped in `KeyboardAvoidingView` to move above keyboard when focused
- Horizontal flex layout: `flexDirection: row`
- Appropriate margins from screen edges (16px left, 16px right, 16px bottom)
- Gap between SearchBar and action button: 12px

**SearchBar Positioning:**
- Fixed width: takes most horizontal space (e.g., screen width - 56px button - 12px gap - 32px margins)
- Always visible
- Left-aligned within bottom bar

**Action Button Positioning (AddRecipeButton / CancelSearchButton):**
- Fixed size: 56x56 points (circular)
- Right-aligned within bottom bar
- Both buttons positioned in EXACT same location using shared container
- Only one button rendered at a time based on `isFocused` state

### Button Synchronization
- AddRecipeButton and CancelSearchButton must be perfectly aligned
- Use shared positioning container with absolute positioning
- Both buttons have identical size (56x56)
- Both buttons have identical margins and positioning values
- Conditional rendering ensures only one is mounted at a time

### Keyboard Behavior
- When search input focused:
  - Keyboard appears
  - Bottom bar moves above keyboard via KeyboardAvoidingView
  - CancelSearchButton replaces AddRecipeButton
- When search input blurred:
  - Keyboard dismissed
  - Bottom bar returns to bottom
  - AddRecipeButton replaces CancelSearchButton
- X button inside SearchBar: clears text only, doesn't affect keyboard or focus
- Cancel button: clears text + dismisses keyboard + removes focus

### Search Algorithm
- Uses `@nozbe/microfuzz` for fuzzy search (2KB gzipped)
- Case-insensitive and diacritics-insensitive matching
- Matches query letters in order, but not necessarily consecutively
- Searches across recipe title and tags (strips `#` prefix from tags)
- Empty search term returns all recipes
- Optimized for performance: filters thousands of items in milliseconds

---

## Implementation Order for LLM

1. **Phase 1** → Pure functions, no dependencies, easily testable
2. **Phase 2** → Builds on Phase 1, adds React integration
3. **Phase 3** → Independent UI work, can be done in parallel with Phase 2
4. **Phase 4** → Final integration, requires all previous phases

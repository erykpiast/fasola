# Plan - Search Suggestions with Normalized Tag Database

## 1. Implementation Status
- **No feature implementation is assumed done yet**.
- This plan is a full build plan from scratch.

## 2. Scope and Intent
Deliver search suggestions + inline search pills with a systematic tag model:
- tags are stored as first-class records in a tag database,
- recipes store tag references by ID,
- deduplication is handled at write-time (not during search),
- suggestion counts come directly from tag records,
- tag label denormalization happens in the UI/read layer only.

This replaces the previous free-form text tag approach.

## 3. Scope Lock
- Suggestions are tag-only.
- Suggestions are shown only while search is focused.
- Empty input shows top tags; typed input filters by prefix.
- Manual `#` typing is supported for prefix matching (strip leading `#`).
- Suggestion list is capped at 5 items.
- Count format is `99+` for values above 99.
- Pills are created only by suggestion taps.
- No per-pill remove button.
- Pills switch to accent styling when free text is non-empty.
- Clear action resets full query (selected tags + free text).
- Filtering order is strict: `AND(selected tags)` then fuzzy `freeText` within that subset.
- No legacy data migration is required (development hard cutover).
- Tag counts must stay correct after:
  - editing a recipe (including tag removals),
  - deleting one recipe,
  - deleting many recipes in sequence (e.g. deleting a source/book and its recipes).

## 4. Locked Decisions
- Persist tags on recipes as `tagIds` only.
- Denormalize tag labels only in UI/read layer via lookup.
- Keep existing local-storage model (no external DB).
- Keep existing manual local data reset assumption (no migration).
- Compose search input + suggestions in a single React-level component so `app/index.tsx` stays minimal.

## Phase 1 - Tag Storage Architecture Changes

### 1.1 Data model changes
- Add `TagId` to `lib/types/primitives.ts`.
- Add `lib/types/tag.ts`:
  - `id: TagId`
  - `label: `#${string}``
  - `normalizedLabel: string`
  - `recipeCount: number`
  - `lastUsedAt: number`
- Update `lib/types/recipe.ts`:
  - `RecipeMetadata` adds `tagIds: Array<TagId>`.
  - persisted `metadata.tags` is removed from recipe model.

### 1.2 Tag repository
Add `lib/repositories/tags.ts`:
- storage key: `@tags`
- serialized write lock (`withLock`)

Methods:
- `getAll(): Promise<Array<Tag>>`
- `getById(id: TagId): Promise<Tag | null>`
- `getByIds(ids: Array<TagId>): Promise<Array<Tag>>`
- `findByNormalized(normalized: string): Promise<Tag | null>`
- `upsertLabels(labels: Array<string>): Promise<Array<Tag>>`
- `syncRecipeTagDiff(prevTagIds: Array<TagId>, nextTagIds: Array<TagId>): Promise<void>`
- `syncMultipleRecipeDiffs(diffs: Array<{ prevTagIds: Array<TagId>; nextTagIds: Array<TagId> }>): Promise<void>`

### 1.3 Recipe repository write-path updates
Update `lib/repositories/recipes.ts`:
- `save`:
  - resolve candidate labels through `upsertLabels`,
  - persist `metadata.tagIds` only,
  - sync counts.
- `update`:
  - resolve incoming labels/tagIds,
  - diff old/new `tagIds`,
  - persist `tagIds` only,
  - decrement removed tag refs, increment added refs.
- `updateComplete`:
  - classifier labels -> `upsertLabels` -> persist `tagIds`.
- `delete`:
  - apply diff to empty set,
  - remove zero-count tags.
- `savePending`:
  - initialize `metadata.tagIds = []`.

Update `lib/repositories/types.ts` and any write contracts to support label input while persisting only `tagIds`.

### 1.4 Bulk delete correctness (book/source removal)
- For multi-recipe removal flow (`app/manage-books.tsx`):
  - apply tag count updates across all deleted recipes,
  - prefer one batched diff (`syncMultipleRecipeDiffs`) to reduce write amplification,
  - remove tags whose count reaches zero after full batch.

### 1.5 UI-layer denormalization foundation
Add `features/tags/utils/resolveRecipeTags.ts`:
- `buildTagLookup(tags: Array<Tag>): Map<TagId, Tag>`
- `resolveTagLabels(tagIds: Array<TagId>, lookup: Map<TagId, Tag>): Array<`#${string}`>`
- `resolveNormalizedTagTexts(tagIds: Array<TagId>, lookup: Map<TagId, Tag>): Array<string>`

Add `features/tags/context/TagsContext.tsx`:
- load tags from tag repository,
- expose `tags`, `tagLookup`, and refresh helpers,
- mount in `app/_layout.tsx` with other providers.

### 1.6 Phase 1 affected files
- `lib/types/primitives.ts`
- `lib/types/tag.ts` (new)
- `lib/types/recipe.ts`
- `lib/repositories/tags.ts` (new)
- `lib/repositories/recipes.ts`
- `lib/repositories/types.ts`
- `lib/repositories/photosToRecipesMigration.ts`
- `features/recipes-list/context/RecipesContext.tsx`
- `features/background-processing/context/BackgroundProcessingContext.tsx`
- `app/recipe/[id]/edit.tsx`
- `features/recipe-form/components/EditRecipeForm.tsx`
- `features/tags/utils/resolveRecipeTags.ts` (new)
- `features/tags/context/TagsContext.tsx` (new)
- `app/_layout.tsx`
- `app/manage-books.tsx`

### 1.7 Phase 1 validation
- Unit: tag repository dedupe/locking/count-sync/zero-count cleanup.
- Integration:
  - add recipe creates tag records + `tagIds`,
  - edit recipe tag removal decrements counts correctly,
  - delete recipe decrements/removes counts,
  - delete source/book with many recipes updates all counts correctly.

## Phase 2 - LiquidGlassInput Variant Migration and Pill Foundation

### 2.1 Variant API migration (`search|form` -> `text|tags|mixed`)
Update `LiquidGlassInput` API to match the new mode model:
- change `variant` union in `modules/liquid-glass/src/LiquidGlassInput.types.ts` from `"search" | "form"` to `"text" | "tags" | "mixed"`.
- update JS and iOS implementations to remove branching that depends on `"search"`/`"form"`.
- keep default behavior equivalent to current form usage (`variant` default resolves to text-only mode).

### 2.2 Call-site migration (required in same phase)
Migrate every existing `LiquidGlassInput` call site to new variants:
- `features/search/components/SearchBar.tsx`: `variant="search"` -> `variant="mixed"`.
- `app/manage-books.tsx`: `variant="form"` -> `variant="text"`.
- `features/source-selector/components/SourceSelector.tsx`: `variant="form"` -> `variant="text"`.
- `features/recipe-form/components/MetadataFormFields.tsx`: pass explicit `variant="text"` (today it relies on implicit default).

Enforce completion:
- grep must return no `"search"`/`"form"` `LiquidGlassInput` variants in app code.

### 2.3 Inline tag-pill capability in `LiquidGlassInput`
Add search-only optional props to `LiquidGlassInputProps` (used for `variant === "tags"` and `variant === "mixed"`):
- `selectedTags?: Array<{ id: TagId; label: string; accessibilityLabel?: string }>`
- `onTagPress?: (id: TagId) => void` (optional, no per-pill remove action required for this scope)
- keep existing `value` as free text and existing clear/focus/blur/submit callbacks.

Behavior:
- preserve current non-search/form behavior for text-entry screens,
- when `variant === "text"` - render only text and ignore `selectedTags`,
- when `variant === "tags"` - render only `selectedTags`,
- when `variant === "mixed"` - render inline pills + editable free text in one glass control,
- accent styling is computed internally in `LiquidGlassInput` (for `tags`/`mixed`) as a visual rule only:
  - accent mode ON when `selectedTags.length > 0 && value.trim().length > 0`,
  - accent mode OFF otherwise,
- clear action clears full query via `onClear`.

### 2.4 Native/module wiring for new variants
Update:
- `modules/liquid-glass/src/LiquidGlassInput.tsx`
- `modules/liquid-glass/src/LiquidGlassInput.ios.tsx`
- `modules/liquid-glass/ios/LiquidGlassInputView.swift`
- `modules/liquid-glass/ios/LiquidGlassModule.swift` (if additional props/events wiring is needed)

Ensure native side understands and renders all three variants correctly.

### 2.5 Phase 2 affected files
- `modules/liquid-glass/src/LiquidGlassInput.types.ts`
- `modules/liquid-glass/src/LiquidGlassInput.tsx`
- `modules/liquid-glass/src/LiquidGlassInput.ios.tsx`
- `modules/liquid-glass/ios/LiquidGlassInputView.swift`
- `modules/liquid-glass/ios/LiquidGlassModule.swift`
- `features/search/components/SearchBar.tsx`
- `app/manage-books.tsx`
- `features/source-selector/components/SourceSelector.tsx`
- `features/recipe-form/components/MetadataFormFields.tsx`

### 2.6 Phase 2 validation
- Type-level:
  - no remaining legacy variants (`"search"`/`"form"`) in app code.
- Manual:
  - existing form/text input screens preserve current UX with `variant="text"`,
  - mixed variant shows inline pills + text,
  - accent toggles automatically in `LiquidGlassInput` when both tags and free text are present.

## Phase 3 - Tag Suggestions in the Search Box

### 3.1 Suggestions data source
- Suggestions come from `Tag` records, not recipe text scans.
- Fields:
  - `label` from `tag.label`,
  - `count` from `tag.recipeCount`,
  - matching via `tag.normalizedLabel`.

### 3.2 Suggestion prefix behavior
- Prefix extraction from active trailing free-text fragment:
  1. read `freeText`,
  2. trim trailing spaces,
  3. split by whitespace,
  4. take last fragment,
  5. strip all leading `#`.

### 3.3 Suggestions hook
Add/update `features/search/hooks/useTagSuggestions.ts`:
- input: `{ tags: Array<Tag>, prefix: string, onSelectSuggestion }`
- output: `{ suggestions, handleSuggestionPress }`
- keep limit/order/count formatting rules:
  - top 5,
  - count desc + alphabetical tie-break,
  - `99+` formatting.

### 3.4 Suggestions overlay UI
Add/update:
- `modules/liquid-glass/src/LiquidGlassSuggestions.types.ts`
- `modules/liquid-glass/src/LiquidGlassSuggestions.tsx`
- `modules/liquid-glass/src/LiquidGlassSuggestions.ios.tsx`
- native iOS `LiquidGlassSuggestionsView` implementation in `modules/liquid-glass/ios/LiquidGlassModule.swift`
- register the view in `modules/liquid-glass/ios/LiquidGlassModule.swift`
- export from `modules/liquid-glass/index.ts`

Platform note:
- iOS suggestions must render through the native LiquidGlass module view (not a React fallback) to preserve consistent liquid-glass visuals with other module components.

Behavior:
- shown while focused only,
- hidden for empty tag DB or no matches,
- hidden on blur/submit,
- no scroll (max 5).
- consumed by `features/search/components/SearchBar.tsx` after composition in Phase 4, not wired directly in `app/index.tsx`.

### 3.5 i18n/a11y for suggestions
Update `platform/i18n/translations/en.json`:
- suggestion accessibility label pluralization keys.

### 3.6 Phase 3 validation
- Unit:
  - prefix handling (`#abc` == `abc`),
  - ordering/limit,
  - `99+` formatting.
- Manual:
  - empty input top tags,
  - typed filtering,
  - overlay focus/blur behavior,
  - count updates reflected immediately after add/edit/delete actions.

## Phase 4 - Search Mechanics Changes

### 4.1 Search query state
Add `features/search/hooks/useSearchQuery.ts`:
- state:
  - `selectedTags: Array<{ id: TagId; label: string }>`
  - `freeText: string`
  - `suggestionPrefix: string`
- actions:
  - `addTagFromSuggestion`,
  - `setFreeText`,
  - `clearQuery`.

### 4.2 React-level search component composition
Refactor existing `features/search/components/SearchBar.tsx` so it combines:
- `LiquidGlassInput` (mixed variant with tag-pill support from Phase 2),
- `LiquidGlassSuggestions` (floating suggestions panel),
- local positioning + visibility logic.

`SearchBar` responsibilities:
- own focus state for showing/hiding suggestions,
- call `useTagSuggestions` internally using `suggestionPrefix`,
- map suggestion selection to `addTagFromSuggestion`,
- encapsulate overlay offsets/stacking and pointer-events behavior,
- expose a small prop surface to screen-level callers.

Proposed `SearchBar` props:
- `selectedTags`
- `freeText`
- `allTags` (from `TagsContext`)
- `onChangeFreeText`
- `onAddTagFromSuggestion`
- `onClearQuery`
- `blocked?: boolean` (true when other popovers should hide/disable suggestions)
- `onSubmitEditing?`
- `style?`

### 4.3 Filtering pipeline
Add `filterRecipesWithQuery(recipes, query, tagLookup)` in `features/recipes-list/utils/recipeSearch.ts`:
1. AND filter by `recipe.metadata.tagIds`.
2. Build fuzzy pool from:
  - title,
  - denormalized labels resolved from `tagLookup`.
3. Apply fuzzy filtering by trimmed `freeText` inside the AND-filtered subset.

### 4.4 Screen integration
Update `app/index.tsx`:
- replace string search flow with `useSearchQuery`,
- consume `tags` + `tagLookup` from `TagsContext`,
- keep using `SearchBar`, but with its new composed internal wiring (input + suggestions),
- filter with `filterRecipesWithQuery(recipes, query, tagLookup)`,
- pass a single `blocked` flag to `SearchBar` based on popover/import visibility,
- keep existing popover conflict behavior while removing search-overlay positioning logic from the screen.

### 4.5 Update read consumers (denormalized labels)
Update consumers to resolve labels from `tagIds` through shared utilities/context:
- `features/recipe-form/hooks/useRecipeForm.ts`
- `features/recipe-form/components/MetadataFormFields.tsx`
- `features/recipe-preview/components/MetadataOverlay.tsx`
- `lib/components/molecules/RecipeMetadataDisplay.tsx`

Rule:
- no consumer reads persisted `metadata.tags`.

### 4.6 i18n/a11y for pills
Update `platform/i18n/translations/en.json`:
- selected-pill accessibility labels.

### 4.7 Phase 4 validation
- Unit:
  - AND filter by `tagIds`,
  - fuzzy phase only after AND filter,
  - fuzzy pool contains resolved labels.
- Integration:
  - query clear resets pills + free text,
  - recipe edit tag removals immediately affect results/suggestions,
  - `SearchBar` correctly hides suggestions when `blocked` is true.
- Manual:
  - select two tags -> AND behavior,
  - add free text -> narrowing within AND set,
  - pill accent toggles automatically inside `LiquidGlassInput` when both tags and free text are present.

## 5. Acceptance Checklist
- Phase 1 complete: normalized tag storage with accurate counts under edit/delete/bulk-delete.
- Phase 2 complete: `LiquidGlassInput` migrated to `text|tags|mixed` with internal accent handling.
- Phase 3 complete: tag suggestions backed by tag DB with correct counts and prefix behavior.
- Phase 4 complete: inline pills + query model + AND-then-fuzzy search behavior.
- No legacy tag-data migration code/path included.
- Lint, typecheck, and tests pass.

## 6. Assumptions
- Local development data reset is acceptable.
- No external database is introduced; storage remains file/AsyncStorage-backed via existing abstraction.
- iOS-native UI implementation remains required for final visual parity.

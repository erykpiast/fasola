# Search Suggestions with Inline Tag Pills

The behavior below is the target UX and functional specification.

## Goal
- Help users compose precise recipe searches using existing tags plus optional free text.
- Match the native Apple iOS apps direction: tags are shown as pills inside the search field.

## Search Query Model
The query has two parts:
- `Selected Tags`: tags chosen from suggestion rows and rendered as pills.
- `Free Text`: non-tag text typed by the user.

Both parts can coexist in one query.

## Suggestions (Tag-Only)
- Suggestions are derived from existing recipe tags only.
- Suggestions are unique by normalized tag (ignore case and leading `#`).
- Suggestions appear only while the search field is focused.
- Suggestions are shown for empty input (top tags), and narrowed by typed prefix.
- Prefix matching is case-insensitive.
- Manual `#` typing is supported for matching:
  - leading `#` in the active prefix is ignored.
  - Example: `#bo` behaves like `bo`.

### Suggestion Row Content
- Leading `#` icon.
- Tag label without `#`.
- Trailing recipe count, right-aligned.

### Suggestion Ordering and Limits
- Order by count descending, then alphabetical ascending.
- Count format:
  - `0` to `99`: exact number.
  - `100+`: `99+`.
- Max visible suggestions: `5`.
- No scrolling required.

### Suggestion Visibility Rules
- Hide when no tags exist.
- Hide when no prefix matches.
- Hide on blur or submit.

## Inline Tag Pill UX in Search Field
- Selected tags are rendered inline as rounded pills with background.
- No per-pill remove (`x`) button.
- Pills are created only by tapping suggestion rows.
- Typing text does not auto-convert text into pills.

### Pill Color Modes
- Default mode: `freeText` is empty.
- Accent mode: any `freeText` exists (before, between, or after pills).

## Selection and Editing Behavior
- Tapping a suggestion adds a tag pill and keeps keyboard focus.
- Tapping an already-selected tag does nothing (dedupe).
- Clear action clears full query: all pills + free text.

## Filtering Semantics
Filtering is two-phase and deterministic:
1. Tag prefilter: include recipes containing **all** selected tags (AND logic).
2. Free-text narrowing: if `freeText` is non-empty, fuzzy-search only inside prefiltered recipes.

Additional rules:
- Free-text fuzzy query is the combined non-pill text.
- Tags only: return tag-prefiltered set.
- Free text only: preserve fuzzy behavior across all recipes.
- Empty tags + empty free text: return all recipes.

## Visual and Layout
- Suggestions render as floating overlay above keyboard/bottom bar.
- Overlay does not push existing layout.
- Inline pill + text composition must remain readable and stable.

## Accessibility
- Each suggestion row is an accessible button with tag + count label.
- Pills are announced as selected search tags.
- VoiceOver order follows visual order.
- Dynamic type is supported.

## Out of Scope
- Auto-tokenizing typed words into pills.
- Per-pill remove controls.
- Search-history suggestions.
- Title/history-based suggestions.

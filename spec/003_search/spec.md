Add a search field that filters the recipes displayed on the main grid.

The search term entered should be matched against the metadata - the title and the tags.

## Layout and Positioning

At the bottom of the screen, two UI elements are always present:
- **Search bar** - positioned at the bottom-left, taking most of the horizontal space
- **Action button** - positioned at the bottom-right, a smaller circular button

Both elements have glass/blur effect styling and maintain fixed positions with proper margins from screen edges.

## Search Bar Behavior

The search bar is always visible and has a fixed width. It contains:
- Magnifying glass icon on the left side
- Text input field
- Small circular X button on the right side (only visible when text is non-empty)

**When search is NOT focused:**
- Search bar is visible but not active
- Placeholder text shown
- X button hidden (even if text present from previous search)

**When search is focused:**
- Keyboard appears
- Search bar gains focus styling
- User can type search query
- Grid filters dynamically as user types
- X button appears when text is non-empty

**X button behavior (inside search bar):**
- Only visible when search text is non-empty AND search is focused
- Tapping X clears the text field
- Does NOT dismiss keyboard
- Does NOT remove focus from search bar

**Keyboard dismiss:**
- User taps return/search on keyboard: dismisses keyboard, removes focus, keeps text
- User taps outside search bar: dismisses keyboard, removes focus, keeps text

## Action Button Behavior

Two separate buttons occupy the same position at bottom-right:
- **Add Recipe button** (circular plus icon)
- **Cancel button** (circular X icon)

Only one button is rendered at a time, but they must be perfectly synchronized in position and size.

**Add Recipe button:**
- Visible when search is NOT focused
- Tapping opens recipe creation flow
- Slightly smaller than the plus button in original design

**Cancel button:**
- Visible when search IS focused (regardless of whether search text is empty or non-empty)
- Tapping clears search text, dismisses keyboard, removes focus from search bar
- Replaces Add Recipe button in the exact same position

## Filtering Behavior

The grid should be filtered dynamically as the user enters the phrase. The solution should use modern React features such as deferred rendering and transitions to ensure snappy experience even in long recipes lists.

For now, let's keep it simple. No autocompletion or anything like this.
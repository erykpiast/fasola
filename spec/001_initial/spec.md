Create very simple application where I can add photos:

- imported from the library
- taken by the camera

Photos will appear on a list.

The layout should consist of the list on the top and the add button on the bottom, in the middle of the screen.
The layout should use the Liquid Glass framework via the `expo-glass-effect` library. The layout should support
light and dark theme, and match OS settings automatically.

The button should be a big + sign.

The list should be a thumbnails gallery. Three photos in a row. Each photo cropped to a square.
When the list is initially empty, there should be an arrow pointing towards the add button with a text "Import new
recipes here".

All text copy in the application should come from a translation system. The translation should match the current OS
language. If not available, it should fall back to English. For starters, implement only English translations.

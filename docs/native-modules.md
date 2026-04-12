# Native Modules

## liquid-glass

Custom Expo module providing iOS-specific UI components with glass/blur effects.

### Components

- `LiquidGlassButton` - Glass-effect buttons
- `LiquidGlassInput` - Glass-effect text inputs
- `LiquidGlassSelect` - Glass-effect picker/dropdown
- `LiquidGlassMenu` - Glass-effect context menus
- `LiquidGlassPopover` - Glass-effect popover with morph animation from a collapsed button state

### Implementation

Swift implementations in `modules/liquid-glass/ios/`.

## page-dewarper

Native page dewarping module using [page-dewarp-swift](https://github.com/erykpiast/page-dewarp-swift). iOS-only.

### API

- `dewarpImage(uri: string): Promise<{ bwUri: string }>` - Dewarp a page image, returning a BW-thresholded image optimized for OCR.

### Implementation

Uses the `PageDewarp` CocoaPod (`~> 2.0`) from [erykpiast/page-dewarp-swift](https://github.com/erykpiast/page-dewarp-swift). OpenCV is provided transitively via the `opencv-rne` dependency.

## iOS Debugging

Bundle ID: `com.erykpiast.fasola`

For simulator debugging, the app can send HTTP POST requests to `127.0.0.1:7247` for debug logging (see `.cursor/skills/expo-debugging/SKILL.md`).

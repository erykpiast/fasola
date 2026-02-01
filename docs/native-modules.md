# Native Modules

## liquid-glass

Custom Expo module providing iOS-specific UI components with glass/blur effects.

### Components

- `LiquidGlassButton` - Glass-effect buttons
- `LiquidGlassInput` - Glass-effect text inputs
- `LiquidGlassSelect` - Glass-effect picker/dropdown
- `LiquidGlassMenu` - Glass-effect context menus

### Implementation

Swift implementations in `modules/liquid-glass/ios/`.

### iOS Debugging

Bundle ID: `com.erykpiast.fasola`

For simulator debugging, the app can send HTTP POST requests to `127.0.0.1:7247` for debug logging (see `.cursor/skills/expo-debugging/SKILL.md`).

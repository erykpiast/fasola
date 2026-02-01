---
name: expo-debugging
description: Debug Expo/React Native apps using iOS Simulator with HTTP logging. Use when debugging, testing changes, verifying behavior, or when the user mentions simulator, Expo, logging, or wants to test app changes.
---

# Expo Debugging

## Critical Network Topology

**ALWAYS test Expo apps in the iOS Simulator, NOT on physical devices, when using debug logging.**

The Cursor debug server runs on `127.0.0.1:7247` (localhost):
- **iOS Simulator**: Shares the host machine's network → CAN reach localhost
- **Physical devices**: On a separate network → CANNOT reach localhost

## iOS Simulator MCP Tools

**Server identifier**: `user-ios-simulator`

### Simulator control
- `open_simulator` - Opens the iOS Simulator app
- `get_booted_sim_id` - Gets the UDID of currently booted simulator

### App management
- `launch_app` - Launches app by bundle ID
  - `bundle_id`: For this project use `com.erykpiast.fasola`
  - `terminate_running`: Set true to restart if already running
- `install_app` - Installs .app bundle on simulator
  - `app_path`: Path to `.app` directory or `.ipa` file

### Screen capture
- `ui_view` - Get compressed screenshot of current view
- `screenshot` - Save screenshot to file (`output_path`, `type`)

### UI interaction
- `ui_tap` - Tap at coordinates (`x`, `y`)
- `ui_type` - Type text
- `ui_swipe` - Swipe gesture
- `ui_describe_all` - Get UI element tree
- `ui_describe_point` - Describe element at coordinates

## Launching the Simulator

Use MCP to check if a simulator is running:

```typescript
CallMcpTool({
  server: "user-ios-simulator",
  toolName: "get_booted_sim_id",
  arguments: {}
})
```

If no simulator is booted, boot one via shell:

```bash
xcrun simctl boot "iPhone 16 Pro" && open -a Simulator
```

## Building and Running the App

### Full build (native changes or first time)

```bash
npx expo run:ios
```

This builds the native app, installs it on the simulator, starts Metro, and launches the app. Build time: ~2-5 minutes first build, ~30-60 seconds incremental.

### JavaScript-only changes (faster)

If the native build already exists, start only Metro:

```bash
npm start
```

Then launch the app via MCP:

```typescript
CallMcpTool({
  server: "user-ios-simulator",
  toolName: "launch_app",
  arguments: {
    bundle_id: "com.erykpiast.fasola",
    terminate_running: true
  }
})
```

### When to use which

| Change Type | Action |
|-------------|--------|
| First time / native code / new dependencies / config changes | `npx expo run:ios` |
| JavaScript/TypeScript only | `npm start` + MCP `launch_app` |

## Debug Logging Pattern

Use HTTP POST requests to send debug logs to Cursor:

```typescript
fetch('http://127.0.0.1:7247/ingest/{session-id}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    location: 'ComponentName.tsx:functionName',
    message: 'Brief description',
    data: { /* relevant variables */ },
    timestamp: Date.now(),
    sessionId: 'debug-session',
    hypothesisId: 'A'
  })
}).catch(() => {});
```

### Field descriptions

- `location`: File and function name (e.g., `"SourceSelector.tsx:handlePress"`)
- `message`: Human-readable description of the event
- `data`: Relevant variables, props, state, or context
- `timestamp`: Current timestamp via `Date.now()`
- `sessionId`: Use `'debug-session'` for all logs
- `hypothesisId`: Hypothesis IDs being tested (e.g., `'A'` or `'A,B'`)

**Remove all debug logging before committing code.**

## Debugging Workflow

1. **Check simulator status** via MCP `get_booted_sim_id`
   - If not booted: `xcrun simctl boot "iPhone 16 Pro" && open -a Simulator`

2. **Build/run the app**
   - Native changes: `npx expo run:ios`
   - JS-only changes: `npm start` then MCP `launch_app`

3. **Add debug logging** at relevant points in code

4. **Test via MCP tools**
   - `ui_view` to see current state
   - `ui_tap` to trigger interactions
   - Observe logs in Cursor debug panel

5. **Clean up** - Remove all debug logging before committing

## Common Logging Patterns

### Button press
```typescript
const handlePress = (): void => {
  fetch('http://127.0.0.1:7247/ingest/{session-id}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: 'MyButton.tsx:handlePress',
      message: 'Button pressed',
      data: {},
      timestamp: Date.now(),
      sessionId: 'debug-session',
      hypothesisId: 'A'
    })
  }).catch(() => {});
  // actual logic...
};
```

### State changes
```typescript
useEffect((): void => {
  fetch('http://127.0.0.1:7247/ingest/{session-id}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: 'MyComponent.tsx:useEffect[someState]',
      message: 'State changed',
      data: { newValue: someState },
      timestamp: Date.now(),
      sessionId: 'debug-session',
      hypothesisId: 'B'
    })
  }).catch(() => {});
}, [someState]);
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No simulator booted | `xcrun simctl boot "iPhone 16 Pro" && open -a Simulator` |
| Build fails "No devices available" | `xcrun simctl list devices available` to verify Xcode setup |
| Metro not connecting | Restart app via MCP `launch_app` with `terminate_running: true` |
| App crashes on launch | Rebuild with `npx expo run:ios` |

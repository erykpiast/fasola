# OpenCV WebView Bridge Architecture

This directory contains the photo processing implementation using OpenCV.js with proper code sharing between web and native (WebView) platforms.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Code Architecture                         │
├─────────────────────────────────────────────────────────────┤
│  pipelines/opencv-core.ts (Shared TypeScript Logic)         │
│  ├─ Used by: opencv-loader.web.ts (direct import)           │
│  └─ Used by: opencv-webview-bridge.ts (via Metro bundle)    │
├─────────────────────────────────────────────────────────────┤
│  opencv-webview-bridge.ts (Source)                          │
│  └─ Bundled by Metro → opencv-webview-bridge.bundle.js      │
│     └─ Inlined as string into WebView HTML                  │
└─────────────────────────────────────────────────────────────┘
```

## How It Works

### Web Platform

1. `opencv-loader.web.ts` imports shared functions from `pipelines/opencv-core.ts`
2. Functions run directly in the browser context
3. Metro bundles everything together in the main app bundle

### Native Platform (WebView)

1. `opencv-webview-bridge.ts` imports shared functions from `pipelines/opencv-core.ts`
2. **Build step**: Metro bundles the bridge + dependencies → `opencv-webview-bridge.bundle.js`
3. **Runtime**: The bundled code is read as a string and injected into WebView HTML
4. WebView executes the self-contained bundle with all dependencies included

## Build Process

The WebView bridge must be bundled before the app starts:

```bash
# Manual build
npm run build:opencv-bridge

# Automatic (runs before start/build)
npm start  # Runs prestart hook → builds bridge automatically
```

### What Happens During Build?

1. `scripts/build-opencv-bridge.js` uses Metro's programmatic API
2. Metro resolves all TypeScript imports and dependencies
3. Outputs a single JavaScript file with all code bundled together
4. The bundled file is written to `opencv-webview-bridge.bundle.js`

### Metro Transformer

`metro-raw-loader-transformer.js` handles loading the bundle:

- When importing `opencv-webview-bridge.ts`, it reads the `.bundle.js` file
- Returns the entire bundle as a string literal
- This string is then injected into the WebView HTML at runtime

## Code Sharing

All OpenCV processing logic lives in `pipelines/opencv-core.ts`:

- ✅ **Single source of truth** for all OpenCV operations
- ✅ **Type-safe** with full TypeScript support everywhere
- ✅ **DRY** - write once, use everywhere
- ✅ **Testable** - shared functions can be unit tested independently

When adding new OpenCV features:

1. Add the logic to `opencv-core.ts`
2. Both web and native will automatically use it
3. Rebuild the bridge: `npm run build:opencv-bridge`

## Files

### Source Files

- `opencv-webview-bridge.ts` - WebView bridge script (TypeScript source)
- `pipelines/opencv-core.ts` - Shared OpenCV processing functions
- `opencv-loader.web.ts` - Web platform loader
- `opencv-loader.native.ts` - Native platform bridge coordinator

### Generated Files

- `opencv-webview-bridge.bundle.js` - Bundled WebView script (git-ignored)

### Build Scripts

- `scripts/build-opencv-bridge.js` - Metro-based bundler for WebView code
- `metro-raw-loader-transformer.js` - Custom transformer to inline bundles

## Development Workflow

1. Edit OpenCV processing logic in `opencv-core.ts`
2. Edit WebView bridge communication in `opencv-webview-bridge.ts`
3. Run `npm run build:opencv-bridge` to rebuild
4. Test on both web and native platforms

The build automatically runs before `npm start`, so normally you don't need to think about it!

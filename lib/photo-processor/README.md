# Photo Processor - Phase 1 Implementation

## Overview

**Phase 1 Status:** Geometry correction with page-dewarp-js complete.

The photo processor automatically enhances recipe photos using `page-dewarp-js` for geometry correction. Photos imported through the camera or library are automatically processed to detect and flatten curved book pages, correct perspective distortion, and create scan-like rectangular outputs.

## Architecture

### Platform-Specific Implementations

**Web Platform:**

- Direct integration using browser-compatible OpenCV.js
- Custom dewarping implementation adapted from page-dewarp-js
- Runs processing directly in browser using native Canvas API
- No WebView or iframe overhead
- Loads OpenCV.js from CDN on-demand (cached after first use)

**Native Platform (iOS/Android):**

- WebView-based processing using `react-native-webview`
- Loads `page-dewarp-js` from CDN (ESM module) inside WebView
- Bridge code communicates between React Native and WebView
- Hidden WebView component initialized at app root

### Key Components

#### 1. Type Definitions (`types.ts`)

- `PhotoAdjustmentConfig` - Configuration for all processing pipelines
- `ProcessingResult` - Result of photo processing operations
- `ProcessingError` - Error types for processing failures
- `DEFAULT_CONFIG` - Recipe-optimized default settings

#### 2. Platform-Specific Loaders

- `dewarp-loader.ts` - Platform-agnostic export (auto-resolves to .web or .native)
- `dewarp-loader.web.ts` - Direct page-dewarp-js integration for web
- `dewarp-loader.native.ts` - WebView bridge for native platforms

#### 2.1. Processing Pipelines

- `pipelines/geometry.ts` - Geometry correction pipeline with recipe-optimized defaults
- `page-dewarp-browser.ts` - Browser-compatible page dewarping using OpenCV.js
- `utils/image-utils.ts` - Image conversion utilities (DataURL ↔ ImageData)

#### 3. WebView Infrastructure (Native Only)

- `dewarp-webview-bridge.js` - JavaScript code running in WebView
- `DewarpWebViewSetup.native.tsx` - Hidden WebView component
- `DewarpWebViewSetup.web.tsx` - No-op stub for web
- `metro-raw-loader-transformer.js` - Loads .js files as raw strings
- `metro.config.js` - Metro configuration for custom transformer

#### 4. Processing Hook

- `usePhotoAdjustment.ts` - Platform-agnostic hook for photo processing
- Automatically selects correct implementation based on platform
- Provides `processPhoto()` function and `WebViewSetup` component

## Usage

### Basic Usage

```typescript
import { usePhotoAdjustment } from "@/features/photo-adjustment/hooks/usePhotoAdjustment";

function MyComponent() {
  const { processPhoto, isProcessing } = usePhotoAdjustment();

  const handlePhoto = async (uri: PhotoUri) => {
    const result = await processPhoto(uri);

    if (result.success) {
      console.log("Processed photo:", result.processedUri);
    } else {
      console.error("Processing failed:", result.error);
      // Fall back to original photo
    }
  };
}
```

### App Root Setup

The WebView must be initialized at the app root (already done in `app/_layout.tsx`):

```typescript
import { usePhotoAdjustment } from "@/features/photo-adjustment/hooks/usePhotoAdjustment";

export default function RootLayout() {
  const { WebViewSetup } = usePhotoAdjustment();

  return (
    <>
      <Stack />
      <WebViewSetup />
    </>
  );
}
```

### Integration with Photo Import

The `usePhotoImport` hook automatically processes photos:

```typescript
// Already integrated in both index.native.ts and index.web.ts
const { processPhoto } = usePhotoAdjustment();

// After importing photo
const result = await processPhoto(uri);
router.push({ pathname: "/recipe/add", params: { uri: result.processedUri } });
```

## Current Status

### Phase 0: ✅ Complete

- Platform-agnostic infrastructure
- WebView setup for native platforms
- Direct integration for web
- Automatic processing on photo import

### Phase 1: ✅ Complete

- ✅ Geometry correction using page-dewarp-js
- ✅ Curved page detection and flattening
- ✅ Perspective correction
- ✅ Image conversion utilities (DataURL ↔ ImageData)
- ✅ Recipe-optimized default configuration
- ✅ Error handling with fallback to original photo

### Phase 2: ⏳ Pending

- Lighting normalization
- White balance correction
- Shadow removal (CLAHE)

### Phase 3: ⏳ Pending

- Sharpness enhancement
- Noise reduction
- Unsharp mask

## Configuration

Default configuration (optimized for recipe photos):

```typescript
{
  geometry: {
    enabled: true,
    xMargin: 5,      // 5% horizontal margin
    yMargin: 5,      // 5% vertical margin
    outputZoom: 1.0, // Full resolution
    noBinary: true,  // Keep color output
  },
  lighting: {
    enabled: false,  // Phase 2
    // ...
  },
  clarity: {
    enabled: false,  // Phase 3
    // ...
  },
}
```

## Error Handling

Processing failures automatically fall back to the original photo:

```typescript
const result = await processPhoto(uri);

// result.success === false → uses original photo
// result.processedUri will be the original URI if processing failed
```

Error codes:

- `PROCESSING_FAILED` - General processing error
- `DEWARP_FAILED` - Page dewarping failed (Phase 1)
- `NO_PAGE_DETECTED` - No page boundaries found (Phase 1)

## Testing

### Manual Testing

**Phase 1:** Photos are automatically processed with geometry correction.

1. **Web:**

   ```bash
   npx expo start
   ```

   Then press `w` for web

   - Click "Add Recipe" → Select photo from library
   - Photo is automatically processed with geometry correction
   - Recipe creation screen opens with processed photo
   - Check browser console for "[Phase 1] Processing photo with geometry correction"

2. **Native (iOS/Android):**
   ```bash
   npx expo start
   ```
   Then press `i` for iOS or `a` for Android
   - Tap "Add Recipe" → Choose "Camera" or "Library"
   - Photo is automatically processed via WebView
   - Recipe creation screen opens with processed photo
   - Check logs for "[Phase 1] Starting geometry correction"

### Test Cases

Recommended test images for Phase 1:

1. **Straight page at angle** - Should be corrected to rectangle
2. **Curved book page** - Should be flattened and straightened
3. **Recipe card** - Should detect boundaries and crop
4. **No page visible** - Should fallback to original
5. **Very dark/bright photo** - Processing should still work (lighting correction in Phase 2)

### Integration Tests

To be added:

- Automated geometry correction verification
- Processing time benchmarks (target: < 5 seconds)
- Error handling scenarios
- Memory usage profiling

## Implementation Notes

### Phase 1: Geometry Correction

Phase 1 implements automatic geometry correction using `page-dewarp-js`:

- **Web:** Uses npm package directly for optimal performance
- **Native:** Loads from CDN inside WebView to avoid bundler issues
- **Automatic processing:** Triggered on every photo import
- **Error handling:** Falls back to original photo if processing fails
- **Configuration:** Recipe-optimized defaults (5% margins, no binarization)

### Platform Differences

**Web (Direct OpenCV.js):**

```typescript
// Uses browser-compatible OpenCV.js (loaded from CDN)
// Custom dewarping implementation
const result = await dewarpImage(imageDataUrl, config);
// Processing happens directly in browser
```

**Native (WebView Bridge):**

```typescript
// Loads page-dewarp-js from CDN inside WebView
// Communication via postMessage
sendToWebView({ type: "dewarp", imageData, config });
// Response handled asynchronously
```

### Implementation Strategy

**Web Platform:**

- Custom browser-compatible dewarping implementation using OpenCV.js
- Adapted from `page-dewarp-js` algorithm but using HTML5 Canvas API
- Loads OpenCV.js from official CDN (cached after first load)
- No Node.js dependencies (canvas, fs, etc.)
- Direct processing without iframe overhead

**Native Platform:**

- Uses original `page-dewarp-js` library loaded from CDN inside WebView
- WebView provides Node.js-like environment
- Message-based communication with React Native

**Why Different Approaches?**

- **page-dewarp-js** has Node.js dependencies (`canvas`, `fs`) that don't work in browsers
- **Web:** Custom OpenCV.js implementation avoids these dependencies
- **Native:** WebView can run the original library from CDN
- Both achieve the same result: perspective correction and page boundary detection

## Next Steps

Phase 2 will implement:

1. Lighting normalization pipeline
2. White balance correction
3. Shadow removal using CLAHE
4. Illumination correction
5. Processing feedback UI

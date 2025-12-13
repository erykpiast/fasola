# Photo Adjustment Engine Implementation Plan

## Feature: Photo Adjustment Engine

**Purpose:** Automatically process imported recipe photos to enhance readability and create scan-like appearance
**User benefit:** Photos taken in non-ideal conditions are automatically transformed into high-quality, readable recipe documents
**Scope:** Automatic processing pipeline using `page-dewarp-js` for geometry correction, plus custom lighting normalization and sharpness enhancement

## Context & Constraints

### Existing Code

- **Photo Import:** `features/photos/hooks/usePhotoImport` - handles camera/library import and routes to recipe creation
- **Recipe Storage:** `lib/repositories/recipes.ts` - stores recipes with `photoUri` property
- **Image Display:** `lib/components/atoms/RecipeImageDisplay.tsx` - displays recipe images using expo-image
- **Platform Support:** Platform-specific implementations already in place (`.native.ts`, `.web.ts`)

### Dependencies

- **New:** `page-dewarp-js` - JavaScript page dewarping library using opencv-wasm bindings (handles geometry correction including curved page detection)
- **Existing:** `expo-image`, `expo-image-picker`, React Native WebView (for native)

### Constraints

- Must work in Expo Go (no native modules)
- WebView-based processing for native platforms
- Direct integration for web
- Memory efficiency for large images
- Processing time should be < 5 seconds per image

### Assumptions

- Users will primarily photograph book pages at various angles
- Photos may have uneven lighting, shadows, and perspective distortion
- Books may have curved pages (page-dewarp-js handles this automatically)
- Text readability is the primary goal

## Requirements Mapping

| Requirement            | Solution Approach                                      | Phase |
| ---------------------- | ------------------------------------------------------ | ----- |
| Geometry correction    | `page-dewarp-js` for curved page detection & dewarping | 1     |
| Lighting normalization | White balance, illumination correction, CLAHE          | 2     |
| Sharpness enhancement  | Denoise, unsharp mask                                  | 3     |
| Automatic processing   | Process during import without user input               | 1     |
| Processing feedback    | Simple progress indicator                              | 1     |
| Error handling         | Fallback to original on failure                        | 1     |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Photo Import Flow                         │
├─────────────────────────────────────────────────────────────┤
│              usePhotoImport (modified)                      │
├─────────────────────────────────────────────────────────────┤
│        usePhotoAdjustment Hook (Platform Router)            │
├──────────────────────┬──────────────────────────────────────┤
│    Native Platform   │         Web Platform                 │
├──────────────────────┼──────────────────────────────────────┤
│  PhotoProcessorView  │    Direct page-dewarp-js             │
│     (WebView)        │      Integration                     │
├──────────────────────┴──────────────────────────────────────┤
│                 Processing Pipeline                         │
├─────────────────────────────────────────────────────────────┤
│  page-dewarp-js  │  Lighting  │  Clarity                    │
│  (Geometry)      │  Pipeline  │  Pipeline                   │
└─────────────────────────────────────────────────────────────┘
```

### page-dewarp-js Integration

The `page-dewarp-js` library provides:

- **Curved page boundary detection** - automatically detects book/document edges
- **3D shape estimation** - models the curved surface of book pages
- **Dewarping transformation** - flattens curved pages to rectangular output
- **opencv-wasm bindings** - runs efficiently in browser/WebView environments

This eliminates the need to implement custom contour detection and perspective transformation.

## Key Interfaces

```typescript
// Core types
export interface PhotoAdjustmentConfig {
  geometry: {
    enabled: boolean;
    // page-dewarp-js configuration options
    xMargin: number; // Horizontal page margin as % of page width (default: 5)
    yMargin: number; // Vertical page margin as % of page height (default: 5)
    outputZoom: number; // Output zoom factor (default: 1.0)
    noBinary: boolean; // Skip binary thresholding on output (default: true for recipe photos)
  };
  lighting: {
    enabled: boolean;
    whiteBalance: "gray-world" | "simple" | "none";
    claheClipLimit: number; // 2.0-3.5
    claheTileSize: number; // 8
  };
  clarity: {
    enabled: boolean;
    denoiseStrength: number; // 3-7
    sharpenRadius: number; // 1.2-1.8
    sharpenAmount: number; // 0.8-1.4
    sharpenThreshold: number; // 2-4
  };
}

// page-dewarp-js programmatic API usage
// import { dewarp, Config } from 'page-dewarp-js';
// const config: Partial<Config> = { xMargin: 5, yMargin: 5, noBinary: true };
// const result = await dewarp(inputImageData, config);

export interface ProcessingResult {
  success: boolean;
  processedUri?: DataUrl;
  error?: ProcessingError;
}

export interface ProcessingError {
  code: "PROCESSING_FAILED" | "DEWARP_FAILED" | "NO_PAGE_DETECTED";
  message: string;
}
```

## Data Flow

1. User captures/selects photo →
2. Photo automatically processed in background →
3. Load image into page-dewarp-js (via WebView on native) →
4. Run geometry correction (page-dewarp-js detects & dewarps curved pages) →
5. Run lighting and clarity pipelines →
6. On success: Navigate to recipe creation with processed photo →
7. On failure: Navigate to recipe creation with original photo

## Implementation Roadmap

### Phase 0: Platform-Agnostic Infrastructure

**Deliverable:** Common page-dewarp-js interface with platform-specific implementations (WebView for native, direct for web)

#### Files to modify:

- [ ] package.json - Add page-dewarp-js and react-native-webview dependencies
- [ ] features/photos/hooks/usePhotoImport/index.native.ts - Add automatic processing
- [ ] features/photos/hooks/usePhotoImport/index.web.ts - Add automatic processing

#### New files:

- [ ] lib/photo-processor/dewarp-loader.native.ts - WebView-based implementation (WebView managed internally)
- [ ] lib/photo-processor/dewarp-loader.web.ts - Direct page-dewarp-js implementation
- [ ] lib/photo-processor/dewarp-webview-bridge.js - JavaScript bridge code for WebView (loaded as raw string)
- [ ] lib/photo-processor/DewarpWebViewSetup.native.tsx - Hidden WebView component
- [ ] lib/photo-processor/DewarpWebViewSetup.web.tsx - No-op stub for web
- [ ] lib/photo-processor/types.ts - Core interfaces and types
- [ ] features/photo-adjustment/hooks/usePhotoAdjustment.ts - Platform-agnostic processing hook
- [ ] metro.config.js - Metro bundler configuration
- [ ] metro-workers-transformer.js - Custom transformer to load .js files as raw strings

#### Tests:

- [ ] Unit: page-dewarp-js loader initialization (both platforms)
- [ ] Unit: WebView message passing contract (internal to native loader)
- [ ] Integration: Photo import triggers processing on both platforms

#### Validation:

1. Run `npm install page-dewarp-js react-native-webview`
2. Web: Navigate to camera → take photo → processing happens automatically
3. Native (WebView): Same flow works via WebView bridge
4. Recipe creation screen opens with processed photo on both platforms

### Phase 1: Geometry Correction with page-dewarp-js

**Deliverable:** Photos are automatically dewarped (handles both perspective correction AND curved page flattening)

#### Files to modify:

- [ ] features/photo-adjustment/hooks/usePhotoAdjustment.ts - Add geometry pipeline using page-dewarp-js
- [ ] lib/photo-processor/dewarp-webview-bridge.js - Add dewarp processing logic
- [ ] lib/photo-processor/dewarp-loader.native.ts - Add dewarp processing support to WebView bridge
- [ ] lib/photo-processor/dewarp-loader.web.ts - Add dewarp processing support

#### New files:

- [ ] lib/photo-processor/pipelines/geometry.ts - Wrapper around page-dewarp-js with recipe-optimized defaults
- [ ] lib/photo-processor/utils/image-utils.ts - Image conversion utilities (data URL ↔ ImageData)

#### page-dewarp-js Integration:

```typescript
import { dewarp, Config } from "page-dewarp-js";

// Recipe-optimized configuration
const recipeConfig: Partial<Config> = {
  xMargin: 5, // 5% horizontal margin
  yMargin: 5, // 5% vertical margin
  noBinary: true, // Keep color output (don't binarize)
  outputZoom: 1.0, // Full resolution output
};

// Process image
const result = await dewarp(inputImageData, recipeConfig);
```

#### Tests:

- [ ] Unit: page-dewarp-js processes flat page correctly
- [ ] Unit: page-dewarp-js handles curved book pages
- [ ] Integration: Process sample image with known page

#### Validation:

1. Import photo of book page at angle → corrected to rectangle
2. Import photo of curved book page → flattened correctly
3. Manual test: Various angles, distances, page curvatures

### Phase 2: Lighting Enhancement

**Deliverable:** Automatic lighting correction for even illumination

#### Files to modify:

- [ ] features/photo-adjustment/hooks/usePhotoAdjustment.ts - Add lighting pipeline

#### New files:

- [ ] lib/photo-processor/pipelines/lighting.ts - White balance, illumination, CLAHE
- [ ] features/photo-adjustment/components/ProcessingIndicator.tsx - Simple loading state

#### Tests:

- [ ] Unit: White balance correction algorithms
- [ ] Unit: CLAHE parameter effects
- [ ] Integration: Shadow removal effectiveness

#### Validation:

1. Import photo with shadows
2. Recipe creation opens with evenly lit image
3. Shadows reduced, contrast improved automatically

### Phase 3: Sharpness Enhancement

**Deliverable:** Crisp, readable text

#### Files to modify:

- [ ] features/photo-adjustment/hooks/usePhotoAdjustment.ts - Add clarity pipeline

#### New files:

- [ ] lib/photo-processor/pipelines/clarity.ts - Denoise, unsharp mask
- [ ] lib/photo-processor/utils/filters.ts - Custom filter implementations

#### Tests:

- [ ] Unit: Denoise preserves text edges
- [ ] Unit: Unsharp mask parameter ranges
- [ ] Integration: Full pipeline processing

#### Validation:

1. Process slightly blurry photo
2. Text appears sharper
3. No excessive halos or artifacts
4. Small text remains readable

### Phase 4: Error Handling & Robustness

**Deliverable:** Graceful handling of edge cases and processing failures

#### Files to modify:

- [ ] features/photo-adjustment/hooks/usePhotoAdjustment.ts - Add error handling
- [ ] features/photos/hooks/usePhotoImport/index.native.ts - Handle processing failures
- [ ] features/photos/hooks/usePhotoImport/index.web.ts - Handle processing failures

#### New files:

- [ ] lib/photo-processor/utils/error-handler.ts - Centralized error handling
- [ ] lib/photo-processor/utils/fallback-strategies.ts - Partial processing fallbacks

#### page-dewarp-js Error Handling:

```typescript
try {
  const result = await dewarp(inputImageData, config);
  // Success: use dewarped image
} catch (error) {
  // page-dewarp-js may fail if:
  // - No text contours detected
  // - Page boundaries cannot be determined
  // - Image too small or corrupted
  // Fallback: skip geometry, apply lighting/clarity only
}
```

#### Tests:

- [ ] Unit: Error recovery strategies
- [ ] Unit: Partial pipeline execution (skip geometry on failure)
- [ ] Integration: Various failure scenarios

#### Validation:

1. Process image with no detectable page → falls back to lighting only
2. Process corrupted image → uses original
3. page-dewarp-js fails to load → uses original photo
4. Memory constraints → reduces resolution and retries

### Phase 5: Performance Optimization

**Deliverable:** Fast, memory-efficient processing

#### Files to modify:

- [ ] lib/photo-processor/pipelines/\*.ts - Add resolution management
- [ ] lib/photo-processor/utils/image-utils.ts - Progressive processing

#### New files:

- [ ] lib/photo-processor/utils/memory-manager.ts - Canvas/buffer pooling
- [ ] lib/photo-processor/utils/performance-monitor.ts - Processing metrics

#### Tests:

- [ ] Performance: Large image processing < 5s
- [ ] Memory: No leaks after 10 consecutive processes
- [ ] Unit: Resolution scaling maintains quality

#### Validation:

1. Process 12MP photo → completes in < 5s
2. Process 10 photos consecutively → no crashes
3. Memory usage returns to baseline
4. Quality remains acceptable at all resolutions

## Testing Strategy

### Unit Tests

- Pipeline modules testable in isolation
- Mock page-dewarp-js functions for speed
- Test parameter ranges and edge cases

### Integration Tests

- Full pipeline with real images
- Platform-specific WebView communication
- Error recovery scenarios

### Visual Tests

- Storybook stories for UI components
- Before/after comparison samples
- Various lighting/angle conditions

### Performance Tests

- Processing time benchmarks
- Memory usage profiling
- Battery impact measurement

## Migration Plan

No data migration required. Feature is additive:

1. Existing recipes keep original photos
2. New recipes get processed photos
3. Future: Batch processing for existing recipes

## Success Metrics

- Processing success rate > 90%
- Average processing time < 3s
- User acceptance rate > 80%
- Crash rate < 0.1%

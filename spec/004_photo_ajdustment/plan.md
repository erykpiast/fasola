# Photo Adjustment Engine Implementation Plan

## Feature: Photo Adjustment Engine

**Purpose:** Automatically process imported recipe photos to enhance readability and create scan-like appearance
**User benefit:** Photos taken in non-ideal conditions are automatically transformed into high-quality, readable recipe documents
**Scope:** OpenCV.js-based automatic processing pipeline for geometry correction, lighting normalization, and sharpness enhancement

## Context & Constraints

### Existing Code

- **Photo Import:** `features/photos/hooks/usePhotoImport` - handles camera/library import and routes to recipe creation
- **Recipe Storage:** `lib/repositories/recipes.ts` - stores recipes with `photoUri` property
- **Image Display:** `lib/components/atoms/RecipeImageDisplay.tsx` - displays recipe images using expo-image
- **Platform Support:** Platform-specific implementations already in place (`.native.ts`, `.web.ts`)

### Dependencies

- **New:** `@techstark/opencv-js` - WebAssembly-based OpenCV for JavaScript
- **Existing:** `expo-image`, `expo-image-picker`, React Native WebView (for native)

### Constraints

- Must work in Expo Go (no native modules)
- WebView-based processing for native platforms
- Direct OpenCV.js integration for web
- Memory efficiency for large images
- Processing time should be < 5 seconds per image

### Assumptions

- Users will primarily photograph book pages at various angles
- Photos may have uneven lighting, shadows, and perspective distortion
- Text readability is the primary goal

## Requirements Mapping

| Requirement            | Solution Approach                             | Phase |
| ---------------------- | --------------------------------------------- | ----- |
| Geometry correction    | Detect page contours, perspective warp        | 1     |
| Lighting normalization | White balance, illumination correction, CLAHE | 2     |
| Sharpness enhancement  | Denoise, unsharp mask                         | 3     |
| Automatic processing   | Process during import without user input      | 1     |
| Processing feedback    | Simple progress indicator                     | 1     |
| Error handling         | Fallback to original on failure               | 1     |

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
│  PhotoProcessorView  │    Direct OpenCV.js                  │
│     (WebView)        │      Integration                     │
├──────────────────────┴──────────────────────────────────────┤
│                   OpenCV.js Engine                          │
├─────────────────────────────────────────────────────────────┤
│  Geometry  │  Lighting  │  Clarity                          │
│  Pipeline  │  Pipeline  │  Pipeline                         │
└─────────────────────────────────────────────────────────────┘
```

## Key Interfaces

```typescript
// Core types
export interface PhotoAdjustmentConfig {
  geometry: {
    enabled: boolean;
    minPageArea: number; // 0.2-0.3 (20-30% of frame)
    padding: number; // 1-2%
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

export interface ProcessingResult {
  success: boolean;
  processedUri?: DataUrl;
  error?: ProcessingError;
}

export interface ProcessingError {
  code: "PROCESSING_FAILED";
  message: string;
}
```

## Data Flow

1. User captures/selects photo →
2. Photo automatically processed in background →
3. Load image into OpenCV.js (via WebView on native) →
4. Run processing pipeline →
5. On success: Navigate to recipe creation with processed photo →
6. On failure: Navigate to recipe creation with original photo

## Implementation Roadmap

### Phase 0: Platform-Agnostic Infrastructure

**Deliverable:** Common OpenCV interface with platform-specific implementations (WebView for native, direct for web)

#### Files to modify:

- [ ] package.json - Add @techstark/opencv-js and react-native-webview dependencies
- [ ] features/photos/hooks/usePhotoImport/index.native.ts - Add automatic processing
- [ ] features/photos/hooks/usePhotoImport/index.web.ts - Add automatic processing

#### New files:

- [ ] lib/photo-processor/opencv-loader.native.ts - WebView-based implementation (WebView managed internally)
- [ ] lib/photo-processor/opencv-loader.web.ts - Direct OpenCV.js implementation
- [ ] lib/photo-processor/opencv-webview-bridge.js - JavaScript bridge code for WebView (loaded as raw string)
- [ ] lib/photo-processor/OpenCVWebViewSetup.native.tsx - Hidden WebView component
- [ ] lib/photo-processor/OpenCVWebViewSetup.web.tsx - No-op stub for web
- [ ] lib/photo-processor/types.ts - Core interfaces and types
- [ ] features/photo-adjustment/hooks/usePhotoAdjustment.ts - Platform-agnostic processing hook
- [ ] metro.config.js - Metro bundler configuration
- [ ] metro-raw-loader-transformer.js - Custom transformer to load .js files as raw strings

#### Tests:

- [ ] Unit: OpenCV loader initialization (both platforms)
- [ ] Unit: WebView message passing contract (internal to native loader)
- [ ] Integration: Photo import triggers processing on both platforms

#### Validation:

1. Run `npm install @techstark/opencv-js react-native-webview`
2. Web: Navigate to camera → take photo → processing happens automatically
3. Native (WebView): Same flow works via WebView bridge
4. Recipe creation screen opens with processed photo on both platforms

### Phase 1: Basic Geometry Correction

**Deliverable:** Photos are automatically perspective-corrected to rectangles

#### Files to modify:

- [ ] features/photo-adjustment/hooks/usePhotoAdjustment.ts - Add geometry pipeline
- [ ] lib/photo-processor/opencv-webview-bridge.js - Add geometry processing logic
- [ ] lib/photo-processor/opencv-loader.native.ts - Add geometry processing support to WebView bridge
- [ ] lib/photo-processor/opencv-loader.web.ts - Add geometry processing support

#### New files:

- [ ] lib/photo-processor/pipelines/geometry.ts - Contour detection, perspective warp (platform-agnostic logic)
- [ ] lib/photo-processor/utils/image-utils.ts - Image conversion utilities

#### Tests:

- [ ] Unit: Contour detection with various page angles
- [ ] Unit: Perspective transformation matrix calculation
- [ ] Integration: Process sample image with known page

#### Validation:

1. Import photo of book page at angle
2. Recipe creation opens with perspective-corrected image
3. Manual test: Various angles, distances

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

#### Tests:

- [ ] Unit: Error recovery strategies
- [ ] Unit: Partial pipeline execution
- [ ] Integration: Various failure scenarios

#### Validation:

1. Process image with no detectable page → falls back to lighting only
2. Process corrupted image → uses original
3. OpenCV.js fails to load → uses original photo
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
- Mock OpenCV.js functions for speed
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

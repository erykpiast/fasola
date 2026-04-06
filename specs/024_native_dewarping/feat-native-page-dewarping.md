# Native Page Dewarping with page-dewarp-swift

**Status:** Draft
**Authors:** Claude Code, 2026-04-06

## Overview

Replace the current WebView-based OpenCV.js dewarping pipeline with a native Swift implementation using the [page-dewarp-swift](https://github.com/erykpiast/page-dewarp-swift) library. The native library produces a BW (adaptive-thresholded) image suitable for OCR, while a color remap is added to produce the user-facing dewarped image. From the user's perspective, nothing changes — the displayed photo remains color-dewarped, and OCR receives an optimized BW image.

## Background / Problem Statement

The current dewarping runs OpenCV.js inside a hidden WebView (`lib/photo-processor/opencv-bridge/`). This approach has several problems:

1. **Unreliable** — Task #4 documents that dewarping "doesn't really work for any photos." The JS port has numerical precision issues and the WebView bridge adds fragility (30s timeouts, CDN dependency for opencv.js).
2. **Slow** — Data round-trips as base64 data URLs between React Native and the WebView. The entire photo is serialized/deserialized multiple times.
3. **Memory-intensive** — Base64 encoding inflates image size ~33%. The WebView holds its own copy of the image in memory.
4. **No page boundary detection** — `calculatePageExtents()` uses fixed margins instead of detecting actual page edges.

The `page-dewarp-swift` library is a faithful Swift port of Matt Zucker's `page_dewarp.py` algorithm — the same algorithm the current JS pipeline is based on — but runs natively with bundled OpenCV, L-BFGS-B optimization, and proper floating-point precision.

**Note:** The underlying algorithm is the same as the JS port. The expected quality improvement comes from native floating-point precision, elimination of WebView serialization artifacts, and removal of the CDN dependency — not from a fundamentally different approach to page detection. The core limitation (fixed-margin page extents rather than true boundary detection) remains. Quality should be validated on real recipe photos before committing to the full integration.

## Goals

- Replace the WebView-based geometry correction with native Swift dewarping on iOS
- Produce two outputs from a single dewarping pass: color-dewarped image (for display) and BW image (for OCR)
- Maintain the existing processing pipeline interface — `processPhoto()` signature and `ProcessingResult` type stay the same
- Eliminate the WebView dependency for geometry processing
- Improve dewarping quality and reliability

## Non-Goals

- Replacing the lighting/clarity pipelines (they remain in the WebView for now)
- Android support (iOS-only for now; not considered)
- Changing the user-visible UI or interaction flow
- Tuning dewarping parameters (separate follow-up)
- Removing the WebView bridge entirely (still needed for lighting/clarity)

## Technical Dependencies

| Dependency | Version | Purpose |
|---|---|---|
| [page-dewarp-swift](https://github.com/erykpiast/page-dewarp-swift) | `main` (vendored source) | Native dewarping algorithm |
| opencv-rne | ~> 4.11 (via react-native-executorch) | OpenCV core/imgproc (already in project) |
| L-BFGS-B-C | Vendored in page-dewarp-swift | Optimization solver |
| ExpoModulesCore | existing | Native module bridge |

**Requirements:** iOS 16+, Swift 5.9+

## Detailed Design

### Architecture Changes

```
BEFORE:
  BackgroundProcessingContext
    → processPhoto()
      → processGeometry() ──→ WebView (opencv.js) ──→ DataUrl
      → processLighting() ──→ WebView (opencv.js) ──→ DataUrl (color + grayscale)
      → processClarity()  ──→ WebView (opencv.js) ──→ DataUrl
      → processTextRecognition() ──→ Native Vision ──→ OcrResult

AFTER (iOS):
  BackgroundProcessingContext
    → processPhoto()
      → processGeometry() ──→ Native PageDewarp module ──→ { colorUri, bwUri }
      → processLighting() ──→ WebView (opencv.js) ──→ DataUrl (color + grayscale)
      → processClarity()  ──→ WebView (opencv.js) ──→ DataUrl
      → processTextRecognition() ──→ Native Vision ──→ OcrResult

AFTER (Android / Web):
  (unchanged — WebView pipeline)
```

The key insight: geometry correction becomes a native call that returns **two file URIs** — a color-dewarped image and a BW-thresholded image. The color image feeds into lighting/clarity/display. The BW image feeds into OCR (replacing the grayscale image currently produced by the lighting pipeline).

### New Expo Module: `page-dewarper`

Create a new native module at `modules/page-dewarper/` following the established pattern from `text-extractor` and `liquid-glass`. iOS-only — no Android stub needed.

#### Module structure

```
modules/page-dewarper/
├── index.ts                    # Public API
├── package.json
├── expo-module.config.json
├── tsconfig.json
├── src/
│   └── PageDewarperModule.ts   # requireNativeModule bridge
└── ios/
    ├── PageDewarper.podspec
    ├── PageDewarperModule.swift
    ├── Frameworks/
    │   └── opencv2.xcframework  # Downloaded from page-dewarp-swift SPM binary target
    └── PageDewarp/              # Vendored (forked) source from page-dewarp-swift
        ├── DewarpPipeline.swift
        ├── DewarpConfig.swift
        ├── Remapper.swift
        ├── ...                  # Other Swift sources
        ├── OpenCVBridge/
        │   ├── OpenCVWrapper.h
        │   └── OpenCVWrapper.mm
        └── CLBFGSB/             # Vendored C sources
            └── *.c, *.h
```

#### Swift module (`PageDewarperModule.swift`)

```swift
import ExpoModulesCore
import PageDewarp  // SPM package

public class PageDewarperModule: Module {
    public func definition() -> ModuleDefinition {
        Name("PageDewarper")

        // Returns { colorUri: string, bwUri: string } or throws
        AsyncFunction("dewarpImage") { (inputUri: URL, promise: Promise) in
            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    let imageData = try Data(contentsOf: inputUri)
                    guard let image = UIImage(data: imageData) else {
                        throw Exception(name: "err", description: "Could not load image")
                    }

                    let result = DewarpPipeline.process(image: image)
                    switch result {
                    case .success(let dewarpResult):
                        // Write color image to temp file
                        let colorPath = self.writeTempImage(dewarpResult.colorImage, suffix: "color")
                        // Write BW image to temp file
                        let bwPath = self.writeTempImage(dewarpResult.bwImage, suffix: "bw")

                        promise.resolve([
                            "colorUri": colorPath,
                            "bwUri": bwPath,
                        ])
                    case .failure(let error):
                        promise.reject(error)
                    }
                } catch {
                    promise.reject(error)
                }
            }
        }
    }

    private func writeTempImage(_ image: UIImage, suffix: String) -> String {
        let filename = "\(UUID().uuidString)_\(suffix).jpg"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        let data = image.jpegData(compressionQuality: 0.95)!
        try! data.write(to: url)
        return url.absoluteString
    }
}
```

#### TypeScript API (`index.ts`)

```typescript
import PageDewarperModule from "./src/PageDewarperModule";

export interface DewarpResult {
  colorUri: string;  // file:// URI to color-dewarped JPEG
  bwUri: string;     // file:// URI to BW-thresholded JPEG
}

export async function dewarpImage(uri: string): Promise<DewarpResult> {
  const processedUri = uri.replace("file://", "");
  return PageDewarperModule.dewarpImage(processedUri);
}
```

#### Error handling

The library's `DewarpError` cases (insufficient spans, no text detected, optimization failure) are not individually mapped to the existing `ProcessingError` codes. The native module rejects with a generic error; `geometry.native.ts` catches all errors and returns `{ success: false, error: message }`. The caller (`processPhoto`) treats all failures the same — logs a warning and continues with the original image. This is sufficient; the existing pipeline already handles geometry failure this way.

### Required Fork Changes to page-dewarp-swift

The library currently outputs only a single image (BW or grayscale depending on `noBinary` config). We need it to output **both** a color-dewarped image and a BW image from the same remap pass.

The remap maps (`mapXFull`, `mapYFull`) are computed in `Remapper.swift` before any color conversion happens. The grayscale conversion occurs only at the point of `cv::remap` in `OpenCVWrapper.remapImage`. This means the fork is minimal:

1. **`OpenCVWrapper.h` + `OpenCVWrapper.mm`** — Add a new method `remapColorImage:mapX:mapY:width:height:` (not a parameter toggle — a separate method signature in the public header). This uses a 4-channel BGRA mat via the existing `cvMatFromUIImage` (BGR) and `UIImageFromBGRMat` helpers that already exist in the codebase for other methods. The new method is ~20 lines, mirroring `remapImage` but skipping the grayscale conversion.

2. **`Remapper.swift`** — After computing the maps (`mapXFull`, `mapYFull` — plain `[NSNumber]` flat arrays already materialized at this point), call both `remapImage` (existing, produces gray/BW) and `remapColorImage` (new, produces color). Return both. Note: each ObjC call re-copies the `[NSNumber]` arrays into `cv::Mat`; for two calls this is acceptable.

3. **`DewarpPipeline.swift`** — Change return type from `Result<UIImage, DewarpError>` to `Result<DewarpOutput, DewarpError>` where:
   ```swift
   public struct DewarpOutput {
       public let colorImage: UIImage  // Color-dewarped
       public let bwImage: UIImage     // Adaptive-thresholded BW
   }
   ```

The geometry computation (the expensive part — PCA, solvePnP, L-BFGS-B optimization, meshgrid) runs only once. The extra cost is one additional `cv::remap` on a 4-channel mat (~4x memory bandwidth of the gray remap, but remap is not the compute bottleneck).

### Integration into processPhoto()

#### Platform-specific geometry processing

The codebase uses `.native.ts` / `.web.ts` suffixes (not `.ios.ts`) — Metro resolves `.native` for iOS. Create `lib/photo-processor/geometry.native.ts` and `lib/photo-processor/geometry.web.ts`, plus a shared type definition `lib/photo-processor/geometry.d.ts`.

**`geometry.d.ts`** (shared interface):
```typescript
import type { DataUrl } from "@/lib/types/primitives";

export interface NativeGeometryResult {
  success: boolean;
  processedUri?: DataUrl;  // Color-dewarped image as DataUrl (matches existing pipeline format)
  bwUri?: string;          // BW image file URI for OCR (native only, undefined on web)
  error?: string;
}

export function processGeometryNative(
  photoUri: string,
  config: Record<string, unknown>
): Promise<NativeGeometryResult>;
```

**`geometry.native.ts`:**
```typescript
import { dewarpImage } from "page-dewarper";
import type { DataUrl } from "@/lib/types/primitives";
import { loadImageAsDataUrl } from "./utils/loadImageAsDataUrl";
import type { NativeGeometryResult } from "./geometry";

export async function processGeometryNative(
  photoUri: string,
  _config: Record<string, unknown>
): Promise<NativeGeometryResult> {
  try {
    const result = await dewarpImage(photoUri);
    // Convert color output to DataUrl for compatibility with lighting/clarity stages
    const processedUri = await loadImageAsDataUrl(result.colorUri);
    return {
      success: true,
      processedUri,
      bwUri: result.bwUri,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Native dewarp failed",
    };
  }
}
```

**`geometry.web.ts`:**
```typescript
import type { DataUrl } from "@/lib/types/primitives";
import { processGeometry } from "./opencv-bridge";
import type { NativeGeometryResult } from "./geometry";

export async function processGeometryNative(
  photoUri: string,
  config: Record<string, unknown>
): Promise<NativeGeometryResult> {
  // Web path: delegate to existing WebView pipeline, no BW output
  const result = await processGeometry(photoUri as DataUrl, config);
  return {
    success: result.success,
    processedUri: result.processedUri,
    bwUri: undefined,
    error: result.error,
  };
}
```

#### Changes to `lib/photo-processor/index.ts`

The main `processPhoto()` function changes for the geometry phase:

```typescript
import { processGeometryNative } from "./geometry";

// Phase 1: Geometry correction (native on iOS, WebView on web)
let bwImageUri: string | undefined;

if (config.geometry.enabled) {
  const geoResult = await processGeometryNative(photoUri, config.geometry);

  if (geoResult.success && geoResult.processedUri) {
    imageDataUrl = geoResult.processedUri;
    geometryOnlyDataUrl = imageDataUrl;
    bwImageUri = geoResult.bwUri;
  } else {
    console.warn("[Photo Processor] Geometry correction failed:", geoResult.error);
  }
}

// ... lighting and clarity phases unchanged, operate on color imageDataUrl ...

// Phase 4: Text Recognition — use BW image if available
if (config.ocr.enabled) {
  // When native dewarping produced a BW image, use it for OCR.
  // loadImageAsDataUrl converts the file URI to DataUrl, which is what
  // processTextRecognition and the underlying ocr-bridge expect.
  const ocrImage = bwImageUri
    ? await loadImageAsDataUrl(bwImageUri)
    : (grayscaleImageDataUrl || imageDataUrl);
  const result = await processTextRecognition(ocrImage, config.ocr.language);
  // ...
}
```

**Key change:** When native dewarping succeeds and provides a BW image, OCR uses that BW image instead of the grayscale image from the lighting pipeline. The BW image has adaptive thresholding specifically tuned for text recognition.

**Return value:** `processPhoto()` continues to return `processedUri` as a `DataUrl` (base64). The native module writes file URIs, but `geometry.native.ts` converts to DataUrl via `loadImageAsDataUrl()` before returning. This preserves the existing contract — `updateComplete()` in `BackgroundProcessingContext` and the storage layer receive the same format as before.

### File URI vs DataUrl Transition

Currently the pipeline passes `DataUrl` (base64) between all stages. The native module writes files and returns `file://` URIs, which are immediately converted to DataUrl in `geometry.native.ts`. This means:

- The color image is converted to base64 once (for lighting/clarity/storage compatibility)
- The BW image is converted to base64 once (for OCR, which goes through `ocr-bridge/index.native.ts` → `extractTextWithBounds` which also expects DataUrl)
- Lighting/clarity stages continue receiving DataUrl as before

This is intentionally conservative — the base64 round-trip for the geometry output is new overhead, but it preserves the existing pipeline contract without touching unrelated code. Migrating the full pipeline to file URIs is a separate effort.

### OpenCV Integration

The project already includes `opencv-rne` (via `react-native-executorch`), which provides OpenCV `core` and `imgproc` modules. The page-dewarp-swift library originally required `calib3d` as well (for `solvePnP`, `projectPoints`, `Rodrigues`), but these 3 functions have been replaced with pure-Swift implementations:

- `projectPoints` → `projectAndDifferentiate()` in `PureProjection.swift` (already existed in the library)
- `solvePnP` → `solvePnP4Coplanar()` in `Solver.swift` (homography decomposition via DLT)
- `Rodrigues` → `rodrigues()` in `PureProjection.swift` (already existed)

This avoids the CocoaPods "conflicting framework names" error that occurs when two pods vendor `opencv2.xcframework`.

### Source Vendoring

1. **Clone the forked source** into `modules/page-dewarper/ios/PageDewarp/`:
   ```bash
   git clone <fork-url> modules/page-dewarper/ios/PageDewarp --depth 1
   ```
   Copy only `Sources/PageDewarp/`, `Sources/OpenCVBridge/`, and `Sources/CLBFGSB/` directories.

2. **Write a `module.modulemap`** for the OpenCVBridge target (SPM auto-generates this, CocoaPods needs it explicit). Already included in the vendored source.

### Podspec

```ruby
Pod::Spec.new do |s|
  s.name           = 'PageDewarper'
  s.version        = '1.0.0'
  s.summary        = 'Native page dewarping using page-dewarp-swift'
  s.platforms      = { :ios => '16.0' }
  s.swift_version  = '5.9'
  s.static_framework = true

  s.source_files = "PageDewarperModule.swift", "PageDewarp/**/*.{h,m,mm,swift,hpp,cpp,c}"
  s.libraries = 'c++'
  s.frameworks = 'UIKit', 'Accelerate'

  s.dependency 'ExpoModulesCore'
  s.dependency 'opencv-rne', '~> 4.11'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'HEADER_SEARCH_PATHS' => '"$(PODS_TARGET_SRCROOT)/PageDewarp/OpenCVBridge/include" "$(PODS_TARGET_SRCROOT)/PageDewarp/CLBFGSB/include"',
  }
end
```

**Binary size impact:** No additional binary size for OpenCV — `opencv-rne` is already in the app via `react-native-executorch`. The vendored Swift/C source adds a modest amount.

## User Experience

No visible changes. The photo processing pipeline runs in the background as before. The dewarped photo displayed to the user will be color (same as today when `noBinary: true`). OCR accuracy should improve because the BW adaptive-thresholded image is better optimized for text recognition than the current grayscale output from the lighting pipeline.

## Testing Strategy

### Unit tests

- **Native module mock test**: Verify `dewarpImage()` TypeScript wrapper correctly handles success/failure responses from the native module
- **Pipeline integration test**: Verify `processPhoto()` correctly routes to native geometry on iOS and falls back to WebView on web
- **BW image routing test**: Verify that when native dewarping produces a BW image, OCR receives it instead of the lighting-generated grayscale

### On-device testing

- Process photos of open cookbooks (curved pages) — verify color output looks correct
- Process photos with no detectable page — verify graceful fallback (original image returned)
- Process photos with various lighting conditions — verify OCR text quality with BW input
- Compare OCR results before/after: run the same photos through old and new pipelines, compare extracted text

### Regression testing

- Run existing photo collection through the new pipeline
- Compare `processedUri` output quality (visual inspection)
- Compare OCR text output (automated diff)

## Performance Considerations

**Improvements:**
- No WebView startup latency (opencv.js CDN load)
- No base64 serialization for geometry phase (file URIs instead)
- Native C++/Swift execution vs JavaScript in WebView
- Single geometry computation produces both color and BW output

**Costs:**
- OpenCV XCFramework adds ~15-25MB to app binary size
- Two `cv::remap` calls instead of one (color + BW), but remap is fast relative to the optimization phase
- Temporary JPEG files written to disk (cleaned up after processing)

**Memory:**
- The native pipeline processes images on a background thread with autorelease pools
- Peak memory: original image + color remap output + BW remap output (3 full-res images)
- The WebView pipeline currently holds similar amounts in base64 form (actually more due to 33% base64 inflation)

## Security Considerations

- Temp files are written to the app's private temporary directory
- No network requests (OpenCV is bundled, not loaded from CDN — unlike current approach)

## Documentation

- Update `docs/architecture.md` — add `page-dewarper` to native modules section, update photo processing pipeline description
- Update `docs/native-modules.md` — add `page-dewarper` module documentation

## Implementation Phases

### Phase 1: Fork and extend page-dewarp-swift

- Fork the repository
- Add `remapColorImage` method to `OpenCVWrapper.h` / `OpenCVWrapper.mm`
- Update `Remapper.swift` to call both remap paths
- Update `DewarpPipeline.swift` to return `DewarpOutput` with both color and BW images
- Test the fork independently with sample recipe photos — **validate quality improvement before proceeding**

### Phase 2: Create Expo native module

- Create `modules/page-dewarper/` module structure
- Vendor the forked source: copy `Sources/PageDewarp/`, `Sources/OpenCVBridge/`, `Sources/CLBFGSB/`
- Download and vendor the OpenCV XCFramework
- Write `module.modulemap` for OpenCVBridge
- Implement `PageDewarperModule.swift` with `dewarpImage` async function
- Write podspec with correct header search paths and framework linking
- Implement TypeScript bindings
- Verify the module builds and runs in the Expo dev client

### Phase 3: Integrate into processing pipeline

- Create `geometry.d.ts`, `geometry.native.ts`, `geometry.web.ts`
- Update `processPhoto()` to use `processGeometryNative`
- Route BW image to OCR when available
- Test end-to-end on device
- Remove geometry-related code from the WebView bridge (lighting/clarity remain)
- Clean up temp files after `processPhoto()` completes (delete both color and BW temp JPEGs)

## Open Questions

1. **Fallback behavior** — When native dewarping fails (e.g. library error, no page detected), the original image continues through the pipeline unchanged (graceful degradation). This matches the lighting/clarity phases.

2. **Temp file lifecycle** — Temp JPEG files (color + BW) are written by the native module. They should be deleted after `processPhoto()` completes (after OCR has consumed the BW image and the color image has been converted to DataUrl). The simplest approach: delete in a `finally` block in `processPhoto()`.

## References

- [page-dewarp-swift](https://github.com/erykpiast/page-dewarp-swift) — Native Swift dewarping library
- [Matt Zucker's page_dewarp.py](https://github.com/mzucker/page_dewarp) — Original Python algorithm
- [Task #4](.simple-task-master/tasks/4-page-dewarping-doesnt-really-work-for-any-photos.md) — Bug report on current dewarping quality
- [Spec 004](../004_photo_ajdustment/spec.md) — Original photo adjustment pipeline design
- `lib/photo-processor/index.ts` — Current pipeline entry point
- `lib/photo-processor/opencv-bridge/index.native.tsx` — Current WebView bridge (to be partially replaced)
- `modules/text-extractor/` — Reference Expo native module pattern

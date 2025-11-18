# Photo Processor Pipeline Test Script

This directory contains a testing script for the photo-processor module that runs the complete pipeline (preprocessing → optimization → geometry correction) on a single image.

## Quick Start

### Option 1: Using the Shell Script (Easiest)

```bash
cd lib/photo-processor
./test-pipeline.sh pipelines/test-images/book.jpeg
```

### Option 2: Using npx directly

```bash
# From the project root
npx tsx lib/photo-processor/test-pipeline.ts lib/photo-processor/pipelines/test-images/book.jpeg
```

### Option 3: Using npm script

```bash
npm run test:photo-processor -- lib/photo-processor/pipelines/test-images/book.jpeg
```

## Prerequisites

The test script requires two additional dev dependencies:

```bash
npm install --save-dev canvas tsx
```

- **canvas**: Provides Node.js canvas API for image manipulation
- **tsx**: TypeScript execution engine for Node.js

The shell script will automatically install these if they're missing.

## What It Does

The test script:

1. **Loads the input image** from the specified path
2. **Runs the full pipeline** with debug mode enabled:
   - Preprocessing (adaptive thresholding, edge detection, contour detection)
   - Optimization (span detection, cubic sheet model fitting)
   - Geometry correction (remapping with the fitted model)
3. **Outputs debug artifacts** to `lib/photo-processor/debug/`:
   - Step-by-step visualization images
   - Processing statistics
   - Progress log
   - Full debug data as JSON
4. **Saves the corrected image** as `{ORIGINAL_NAME}_corrected.jpeg` next to the script

## Output Structure

```
lib/photo-processor/
├── debug/                           # Debug artifacts directory
│   ├── 01_edges.png                # Edge detection
│   ├── 02_binary_text.png          # Binary text extraction
│   ├── 03_eroded_text.png          # After morphological operations
│   ├── 04_edge_map.png             # Edge map
│   ├── 05_detected_lines.png       # Hough line detection
│   ├── 06_fitted_lines.png         # Fitted lines to contours
│   ├── 07_page_boundary.png        # Detected page boundary
│   ├── 08_span_estimates.png       # Initial span estimates
│   ├── 09_detected_spans.png       # Refined spans
│   ├── 10_keypoint_cloud.png       # Sampled keypoints
│   ├── 11_mesh_grid.png            # Transformation mesh
│   ├── 12_before_after.png         # Side-by-side comparison
│   ├── 13_surface_mesh.png         # 3D surface visualization
│   ├── stats.txt                   # Processing statistics
│   ├── progress.log                # Detailed progress log
│   └── debug-data.json             # Complete debug data
├── book_corrected.jpeg             # Final output
├── test-pipeline.ts                # Test script
├── test-pipeline.sh                # Shell wrapper
└── TEST_SCRIPT_README.md           # This file
```

## Debug Artifacts Explained

### Visualization Images

1. **01_edges.png** - Raw edge detection showing detected edges in the image
2. **02_binary_text.png** - Binary image after adaptive thresholding (white text on black)
3. **03_eroded_text.png** - After morphological operations to connect text regions
4. **04_edge_map.png** - Processed edge map used for line detection
5. **05_detected_lines.png** - Lines detected using Hough transform
6. **06_fitted_lines.png** - Lines fitted to detected text contours
7. **07_page_boundary.png** - Detected page boundary (largest contour)
8. **08_span_estimates.png** - Initial text span position estimates
9. **09_detected_spans.png** - Refined text spans after optimization
10. **10_keypoint_cloud.png** - Sampled keypoints along the detected spans
11. **11_mesh_grid.png** - Transformation mesh grid showing the warp field
12. **12_before_after.png** - Side-by-side comparison of input and output
13. **13_surface_mesh.png** - 3D surface mesh projection visualization

### Text Reports

- **stats.txt**: Human-readable statistics including:

  - Preprocessing stats (contours, lines, page bounds)
  - Optimization metrics (iterations, errors)
  - Model parameters (16 cubic sheet coefficients)
  - Remap statistics (resolution, interpolation method)
  - Processing time
  - Math validation results

- **progress.log**: Chronological log of all processing phases with timestamps

- **debug-data.json**: Complete debug data in JSON format for programmatic access

## Example Usage

### Test with the included sample image

```bash
./test-pipeline.sh pipelines/test-images/book.jpeg
```

### Test with your own image

```bash
./test-pipeline.sh ~/Pictures/curved-page.jpg
```

### Test from project root

```bash
cd /path/to/fasola
npm run test:photo-processor -- lib/photo-processor/pipelines/test-images/book.jpeg
```

## Troubleshooting

### Error: "canvas" module not found

Install the canvas dependency:

```bash
npm install --save-dev canvas
```

On some systems, canvas requires native dependencies. See the [node-canvas wiki](https://github.com/Automattic/node-canvas/wiki) for platform-specific installation instructions.

### Error: Image file not found

Make sure the path to the image is correct. Use an absolute path or a path relative to where you're running the command.

### Pipeline produces unexpected results

1. Check the debug artifacts in the `debug/` directory to see where the pipeline might be failing
2. Review `stats.txt` for the optimization metrics
3. Check `progress.log` for any error messages
4. Ensure the input image contains a clear page with visible text

### Memory issues with large images

The pipeline processes images at their original resolution. For very large images (>10MP), you may need to:

1. Resize the image before processing
2. Increase Node.js memory limit: `NODE_OPTIONS=--max-old-space-size=4096 npx tsx ...`

## Algorithm Overview

The pipeline implements a cubic sheet model for page dewarping:

1. **Preprocessing**: Extract text features and page structure
2. **Optimization**: Fit a 3D cubic surface model to the detected features
3. **Remapping**: Apply inverse transformation to flatten the curved page

For detailed algorithm explanation, see:

- `ALGORITHM_EXPLAINED.md` - High-level algorithm overview
- `DEWARP_IMPLEMENTATION.md` - Implementation details

## Configuration

The pipeline uses default configuration from `config.ts`. To customize:

1. Edit `config.ts` to change preprocessing or optimization parameters
2. Rebuild the optimization worker: `npm run build:optimization-worker`
3. Run the test script again

Key parameters:

- `adaptiveThresholdBlockSize`: Window size for adaptive thresholding (default: 51)
- `numSpans`: Number of text spans to detect (default: 10)
- `maxIterations`: Maximum optimization iterations (default: 100)
- `output.width/height`: Output image resolution (default: 1200x1600)

## Notes

- The test script always enables debug mode to collect comprehensive debugging information
- The output image does NOT contain debug visualizations - it's the clean corrected image
- Debug artifacts are overwritten on each run
- Processing time varies based on image size (typically 2-10 seconds for a 2MP image)
- The algorithm works best with images that have:
  - Clear text lines
  - Good contrast
  - Visible page boundaries
  - Moderate curvature (book pages, slightly warped documents)

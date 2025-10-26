# Debug Visualization for OpenCV Demo

## Overview

The debug visualization feature displays the result of basic OpenCV edge detection (Canny) overlaid on the original image. This is a simple demonstration to verify that OpenCV is working correctly on both web and native platforms.

## How It Works

When debug mode is enabled, the pipeline:

1. Converts the image to grayscale
2. Applies Canny edge detection
3. Returns the original image with edges as debug data

The edges are displayed in blue with transparency overlaid on the original image.

## Enabling/Disabling Debug Mode

Edit `/lib/photo-processor/types.ts` and modify the `DEFAULT_ADJUSTMENT_CONFIG`:

```typescript
export const DEFAULT_ADJUSTMENT_CONFIG: PhotoAdjustmentConfig = {
  // ... other config ...
  debug: {
    enabled: true, // Set to false to disable debug visualization
  },
};
```

## What You'll See

When you import a photo with debug mode enabled:

- **Blue overlay**: Shows the detected edges from Canny edge detection
  - This demonstrates that OpenCV is successfully processing the image
  - The edges appear as a semi-transparent blue overlay

## Architecture

- **Data Flow**: Debug data is captured during processing (currently not stored in context since the original image is returned)
- **Visualization**: Uses an Image component with transparency for edges
- **Overlay**: Positioned absolutely over the recipe image display
- **Scaling**: Automatically adjusts to match the display size

## Files Involved

- `lib/photo-processor/types.ts` - Debug configuration and types
- `lib/photo-processor/pipelines/opencv-core.ts` - Basic edge detection demo
- `features/photo-adjustment/components/DebugVisualization.tsx` - Visualization component
- `features/photo-adjustment/context/DebugContext.tsx` - State management (for future use)

## Performance Notes

Debug mode adds minimal overhead:

- Edge detection is a simple operation (grayscale conversion + Canny)
- The edge image is only generated when debug mode is enabled
- Visualization rendering is lightweight (single Image component)

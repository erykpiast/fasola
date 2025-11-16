# Page Dewarping Algorithm - Detailed Explanation

## Overview

This document provides a comprehensive explanation of the page dewarping algorithm implemented in this codebase. The algorithm transforms photographs of curved pages (like open books) into flat, readable images.

## The Core Problem

When you photograph a page (especially from a book), the page is often curved due to:

- The book binding causing pages to arc
- Pages not lying perfectly flat
- Perspective distortion from the camera angle

This curvature makes text lines appear curved in the photo, which is harder to read and problematic for OCR.

**Our goal**: Transform the curved photo into a flat image where text lines are straight and horizontal.

## The Mathematical Model

### Cubic Sheet Model

We model the page as a **3D surface** in space, described by a cubic polynomial:

```
z(x, y) = Σ(i=0..3) Σ(j=0..3) c_ij * x^i * y^j
```

This gives us **16 coefficients** (c_00 through c_33) that describe how the page curves in 3D space.

**Physical intuition**:

- Think of the page as a flexible sheet that can bend and curl
- The (x, y) coordinates are positions on the page
- The z coordinate is how far the page bulges toward/away from the camera
- Different coefficient combinations create different types of curves:
  - Linear terms (x, y): tilt
  - Quadratic terms (x², xy, y²): cylindrical curves (like book binding)
  - Cubic terms (x³, etc.): more complex warping

### Perspective Projection

The curved 3D page is photographed by a camera, which performs **perspective projection**:

```
x_2d = x_3d * focalLength / (focalLength + z_3d) + center_x
y_2d = y_3d * focalLength / (focalLength + z_3d) + center_y
```

**Key insight**: Points closer to the camera (larger z) appear larger/displaced compared to points farther away.

This projection is what causes the warping we see in the photo.

## The Algorithm Pipeline

### Phase 1: Preprocessing (5-25%)

**Goal**: Extract features from the photo that tell us about the page structure.

**Steps**:

1. **Adaptive Thresholding**

   - Converts image to black text on white background
   - Handles varying lighting (important for photos)
   - Uses local neighborhoods to determine threshold

2. **Canny Edge Detection**

   - Finds strong gradients (edges) in the image
   - Text creates horizontal edges (top/bottom of letters)
   - Also finds page boundaries

3. **Morphological Operations**

   - Dilation connects nearby edge pixels
   - Helps identify continuous text regions
   - Makes lines more visible

4. **Hough Line Transform**

   - Detects straight lines in the image
   - Even on curved pages, text lines are locally straight
   - Gives us initial estimates for text line positions

5. **Contour Detection**
   - Finds closed shapes
   - The page boundary is typically the largest contour
   - Helps focus processing on the actual page

**Output**: Edge map, detected lines, page boundary, initial text span estimates

### Phase 2: Span Detection (25-40%)

**Goal**: Find the exact positions and curvatures of text lines (spans).

**Text Spans**: Horizontal lines of text that follow the page's curvature. Each span is parameterized by:

- `yPosition`: Vertical position of the span
- `curvature`: How much the span curves (parabolic curve)

**Algorithm**: Gradient Descent Optimization

1. **Edge Density Map**

   - Smooth the binary edge map using local averaging
   - Creates a continuous "heat map" of edge intensity
   - High density = text regions, low density = background

2. **Initial Estimates**

   - Extract from Hough lines (filtered for horizontal lines)
   - Sort by vertical position
   - Space evenly across the page height

3. **Refinement Loop** (50 iterations)
   - For each span, sample 20 points along its curve
   - Measure edge density at each point
   - Compute total density (higher = better fit)
   - Use numerical gradients to find improvement direction
   - Update position and curvature parameters
   - Clamp parameters to reasonable ranges

**Why Gradient Descent?**

- Simple problem (2 parameters per span)
- Noisy cost function (edge density isn't perfectly smooth)
- Robust to local minima

**Output**: Refined span positions with curvature parameters

### Phase 3: Model Fitting (40-70%)

**Goal**: Find the 16 cubic sheet coefficients that best explain the page's 3D shape.

**The Problem**: We have 2D keypoints (sampled from spans) in the photo, and we need to find the 3D surface that, when projected, produces those 2D positions.

**Algorithm**: Levenberg-Marquardt Optimization

1. **Keypoint Collection**

   - Sample 20 points along each refined span
   - These are known correspondences: we know where they should be on a flat page
   - We observe where they appear in the curved photo

2. **Optimization Setup**

   - Initial guess: flat page (all coefficients = 0)
   - Cost function: sum of squared reprojection errors
   - For each keypoint:
     - Evaluate cubic polynomial to get z-height
     - Project (x, y, z) to 2D using perspective projection
     - Compare predicted position with actual keypoint
     - Square the error

3. **LM Iteration** (up to 100 iterations)
   - Compute Jacobian matrix (how each coefficient affects each error)
   - Combine gradient descent (when far from solution) with Gauss-Newton (when close)
   - Update all 16 coefficients simultaneously
   - Check convergence (error stops decreasing)

**Why Levenberg-Marquardt?**

- Perfect for non-linear least squares problems
- Fast convergence compared to plain gradient descent
- Robust (combines multiple optimization strategies)
- The ml-levenberg-marquardt library handles Jacobian computation automatically

**Output**: 16 coefficients describing the page's 3D shape

### Phase 4: Remapping (70-95%)

**Goal**: Actually dewarp the image using the fitted 3D model.

**The Challenge**: Forward vs. Inverse Mapping

- **Forward**: "Where does this input pixel go?" → Leaves holes in output
- **Inverse**: "Where did this output pixel come from?" → Perfect coverage

We use **inverse mapping**:

**Algorithm**:

1. **Generate Transformation Maps**

   - Create two float matrices (mapX, mapY) same size as desired output
   - For each output pixel at (x_out, y_out):
     - Normalize: (normX, normY) in range [-0.5, 0.5]
     - Evaluate cubic polynomial: `z = f(normX, normY)`
     - Create 3D point: `(normX * width, normY * height, z * width)`
     - Project to 2D: `(x_in, y_in) = project3D(point3D)`
     - Store: `mapX[y_out][x_out] = x_in`, `mapY[y_out][x_out] = y_in`

2. **Apply Remap**

   - OpenCV's `remap()` function uses the maps
   - For each output pixel, looks up source coordinates
   - Samples input image using cubic interpolation
   - Handles boundary cases (constant border)

3. **Optional Thresholding**
   - Apply adaptive threshold to final output
   - Creates clean black text on white background
   - Good for OCR or document processing

**Why This Works**:

- Every output pixel gets exactly one color value (no holes)
- Cubic interpolation ensures smooth results
- The inverse mapping is exact (based on our fitted model)

**Output**: Dewarped, flattened image

## Mathematical Deep Dive

### Why 16 Coefficients?

A cubic polynomial in two variables has this general form:

```
z(x,y) = c₀₀ + c₀₁y + c₀₂y² + c₀₃y³
       + c₁₀x + c₁₁xy + c₁₂xy² + c₁₃xy³
       + c₂₀x² + c₂₁x²y + c₂₂x²y² + c₂₃x²y³
       + c₃₀x³ + c₃₁x³y + c₃₂x³y² + c₃₃x³y³
```

That's 4×4 = 16 terms, one coefficient per term.

**Why cubic? Why not quadratic or quartic?**

- Quadratic (6 coefficients): Too simple, can't model complex curves
- Cubic (16 coefficients): Good balance of flexibility and stability
- Quartic (25 coefficients): Overfitting risk, optimization becomes unstable

### The Optimization Landscape

**Span Detection** (Gradient Descent):

- Parameters: ~20 (10 spans × 2 parameters each)
- Cost function: Edge density (somewhat noisy)
- Landscape: Multiple local minima (many plausible text line positions)
- Solution: Gradient descent with good initial estimates

**Model Fitting** (Levenberg-Marquardt):

- Parameters: 16 (cubic sheet coefficients)
- Cost function: Reprojection error (smooth)
- Landscape: Bowl-shaped near solution (well-conditioned)
- Solution: LM for fast, robust convergence

### Numerical Stability

**Normalization**: We normalize coordinates to [-0.5, 0.5] before evaluation because:

- Prevents numerical overflow (x³ for x=1000 is huge!)
- Makes coefficients roughly similar magnitude
- Improves optimization conditioning

**Gradient Computation**: We use finite differences:

```
gradient ≈ (f(x + ε) - f(x)) / ε
```

- ε = 0.1 is small enough for accuracy but large enough to avoid floating-point errors
- Trade-off between approximation error and numerical precision

## Performance Considerations

### Computational Complexity

1. **Preprocessing**: O(width × height)

   - Edge detection: Linear in pixels
   - Hough transform: O(n log n) where n = edge pixels

2. **Span Detection**: O(iterations × spans × samples)

   - 50 iterations × 10 spans × 20 samples = 10,000 evaluations
   - Each evaluation samples edge density map: O(1)

3. **Model Fitting**: O(iterations × keypoints × coefficients)

   - 100 iterations × 200 keypoints × 16 coefficients
   - Levenberg-Marquardt computes Jacobian: O(keypoints × coefficients)

4. **Remapping**: O(output_width × output_height)
   - For each output pixel: evaluate polynomial (16 terms) + projection
   - OpenCV remap uses SIMD optimizations

**Total**: For a 2048×1536 image, expect ~2 seconds on modern mobile devices.

### Memory Usage

- Input image: width × height × 4 bytes (RGBA)
- Edge maps: width × height × 1 byte (grayscale)
- Transformation maps: output_w × output_h × 4 bytes × 2 (mapX, mapY)
- Temporary matrices for OpenCV operations

**Optimization**: OpenCV Mats are explicitly deleted after use to prevent memory leaks.

## Failure Cases and Limitations

### When It Works Well

✅ Pages with clear text lines
✅ Moderate curvature (like open books)
✅ Good lighting and contrast
✅ Page fills most of the image

### When It Struggles

❌ Severe warping (crumpled pages)
❌ Low contrast or poor lighting
❌ Blank pages (no text to detect)
❌ Rotated text or non-horizontal writing
❌ Very curved pages where text is barely visible

### Graceful Degradation

The algorithm is designed to fail gracefully:

1. If Hough lines fail, use evenly-spaced initial spans
2. If optimization fails to converge, use initial parameters
3. If entire pipeline fails, return original image
4. Always log errors for debugging

## Comparison with Alternative Approaches

### Other Dewarping Methods

1. **Zhang et al. (2007)**: Shape-from-shading

   - Uses illumination gradients
   - Requires specific lighting
   - Our approach: Geometric, works with any lighting

2. **Deep Learning Approaches**

   - DocUNet, DewarpNet (CNNs)
   - Require training data
   - Our approach: Model-based, no training needed

3. **Simple Polynomial Warping**
   - Fits 2D polynomial directly to image
   - Doesn't model 3D structure
   - Our approach: Physically accurate 3D model

### Why the Cubic Sheet Model?

**Advantages**:

- Physically motivated (models actual page bending)
- No training data required
- Fast optimization (seconds, not hours)
- Interpretable (coefficients have geometric meaning)

**Trade-offs**:

- Assumes smooth, continuous curvature
- Limited to polynomial-describable shapes
- Requires visible text for span detection

## References and Further Reading

This implementation is based on:

**Matt Zucker's Page Dewarping** (2016)

- Blog post: https://mzucker.github.io/2016/08/15/page-dewarping.html
- GitHub: https://github.com/mzucker/page_dewarp
- Original Python implementation

**Key Papers**:

- Zhang & Tan (2007): "Correcting Document Image Warping"
- Brown & Seales (2004): "Image Restoration of Arbitrarily Warped Documents"

**Mathematical Background**:

- Levenberg-Marquardt: "A method for the solution of certain non-linear problems in least squares"
- Perspective projection: Computer vision textbooks (Hartley & Zisserman)

## Debugging and Visualization

The debug visualization shows all intermediate results:

**Preprocessing Tab**:

- Binary text image (after thresholding)
- Edge map (Canny edges)
- Detected lines (Hough transform)
- Page boundary (largest contour)

**Optimization Tab**:

- Detected spans (refined positions)
- Keypoint cloud (sampled points)
- Optimization metrics (iterations, errors)

**Remapping Tab**:

- Mesh grid (warp field visualization)
- 3D surface mesh (cubic sheet projection)
- Before/after comparison

**Metrics Tab**:

- Processing timeline (time spent in each phase)
- Math validation (self-tests pass/fail)
- Parameter values (16 coefficients)

This comprehensive debugging capability makes it easy to understand what the algorithm is doing and diagnose any issues.

## Conclusion

The page dewarping algorithm combines:

- **Computer vision** (edge detection, line detection)
- **Optimization** (gradient descent, Levenberg-Marquardt)
- **3D geometry** (cubic surfaces, perspective projection)
- **Image processing** (remapping, interpolation)

The result is a robust, fast, and physically accurate method for flattening curved pages in photographs. While not perfect for all cases, it handles the common case (photographing book pages) very well and provides a solid foundation for OCR and document processing.

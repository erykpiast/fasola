#!/usr/bin/env python3
"""
Overlay OCR bounding boxes and clustered regions on recipe images.

- Individual observations: semi-transparent blue rectangles
- Clustered regions: yellow border rectangles

Usage:
    python3 tools/title-loop/visualize_bboxes.py IMG_1358
    python3 tools/title-loop/visualize_bboxes.py IMG_1358 IMG_1359 IMG_1383
    python3 tools/title-loop/visualize_bboxes.py --all --limit 10
    python3 tools/title-loop/visualize_bboxes.py IMG_1358 --y-tol 0.03 --gap 0.02
"""

import argparse
import json
import sys
from pathlib import Path

from AppKit import NSImage, NSBitmapImageRep, NSColor, NSFont, NSString, NSBezierPath
from AppKit import NSCompositingOperationSourceOver, NSFontAttributeName, NSForegroundColorAttributeName
from Foundation import NSMakeRect, NSDictionary
from Quartz import CGImageGetWidth, CGImageGetHeight

sys.path.insert(0, str(Path(__file__).parent))
from analyze_bboxes import cluster_into_regions, score_title_region

REPO_ROOT = Path(__file__).parent.parent.parent
IMAGES_DIR = REPO_ROOT / "example-recipes"
BBOXES_DIR = Path(__file__).parent / "bboxes"
OUTPUT_DIR = Path(__file__).parent / "bboxes" / "visualized"


def load_image(image_stem: str) -> NSImage | None:
    for ext in [".HEIC", ".heic", ".jpg", ".jpeg", ".png", ".JPG"]:
        path = IMAGES_DIR / f"{image_stem}{ext}"
        if path.exists():
            return NSImage.alloc().initWithContentsOfFile_(str(path))
    return None


def draw_overlays(image_stem: str, y_tolerance: float, region_gap: float):
    # Load image
    ns_image = load_image(image_stem)
    if ns_image is None:
        print(f"  Could not load image: {image_stem}")
        return None

    # Load bbox data
    bbox_path = BBOXES_DIR / f"{image_stem}.json"
    if not bbox_path.exists():
        print(f"  No bbox data: {bbox_path}")
        return None

    data = json.loads(bbox_path.read_text())
    observations = data["observations"]

    # Get image dimensions (after EXIF orientation)
    size = ns_image.size()
    w = size.width
    h = size.height

    # Cluster into regions
    regions = cluster_into_regions(observations, y_tolerance=y_tolerance, region_gap=region_gap)

    # Score regions for title
    title_idx = -1
    if len(regions) >= 1:
        scores = [(score_title_region(r, regions), i) for i, r in enumerate(regions)]
        scores.sort(key=lambda x: -x[0])
        title_idx = scores[0][1]

    # Create a mutable copy to draw on
    ns_image.lockFocus()

    # Draw individual observations as semi-transparent blue
    blue = NSColor.colorWithCalibratedRed_green_blue_alpha_(0.2, 0.4, 1.0, 0.25)
    blue_border = NSColor.colorWithCalibratedRed_green_blue_alpha_(0.2, 0.4, 1.0, 0.6)

    for obs in observations:
        b = obs["bbox"]
        # Convert normalized coords to pixel coords (NSImage uses bottom-left origin)
        x = b["x"] * w
        y_bottom = (1.0 - b["y"] - b["height"]) * h  # flip back to bottom-left for NSImage
        bw = b["width"] * w
        bh = b["height"] * h

        rect = NSMakeRect(x, y_bottom, bw, bh)

        # Fill
        blue.set()
        NSBezierPath.fillRect_(rect)

        # Border
        blue_border.set()
        path = NSBezierPath.bezierPathWithRect_(rect)
        path.setLineWidth_(1.0)
        path.stroke()

    # Draw clustered regions as yellow border rectangles
    yellow = NSColor.colorWithCalibratedRed_green_blue_alpha_(1.0, 0.9, 0.0, 0.9)
    green = NSColor.colorWithCalibratedRed_green_blue_alpha_(0.0, 1.0, 0.0, 0.9)
    white = NSColor.colorWithCalibratedRed_green_blue_alpha_(1.0, 1.0, 1.0, 0.85)
    font = NSFont.boldSystemFontOfSize_(max(14, h / 60))

    for i, region in enumerate(regions):
        b = region["bbox"]
        x = b["x"] * w
        y_bottom = (1.0 - b["y"] - b["height"]) * h
        bw = b["width"] * w
        bh = b["height"] * h

        rect = NSMakeRect(x, y_bottom, bw, bh)

        # Use green for the title region, yellow for others
        color = green if i == title_idx else yellow
        color.set()
        path = NSBezierPath.bezierPathWithRect_(rect)
        path.setLineWidth_(3.0)
        path.stroke()

        # Label
        score = score_title_region(region, regions) if regions else 0
        label = f"R{i}: {region['lines']}L score={score:.2f}"
        attrs = NSDictionary.dictionaryWithObjects_forKeys_(
            [font, color],
            [NSFontAttributeName, NSForegroundColorAttributeName],
        )
        label_str = NSString.stringWithString_(label)

        # Background for label
        label_size = label_str.sizeWithAttributes_(attrs)
        label_rect = NSMakeRect(x, y_bottom + bh - label_size.height - 4, label_size.width + 6, label_size.height + 4)
        white.set()
        NSBezierPath.fillRect_(label_rect)

        label_str.drawAtPoint_withAttributes_((x + 3, y_bottom + bh - label_size.height - 2), attrs)

    ns_image.unlockFocus()

    # Save as PNG
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    tiff_data = ns_image.TIFFRepresentation()
    bitmap = NSBitmapImageRep.alloc().initWithData_(tiff_data)
    png_data = bitmap.representationUsingType_properties_(4, None)  # 4 = NSBitmapImageFileTypePNG

    output_path = OUTPUT_DIR / f"{image_stem}.png"
    png_data.writeToFile_atomically_(str(output_path), True)

    return output_path, len(observations), len(regions)


def main():
    parser = argparse.ArgumentParser(description="Visualize OCR bboxes and clustered regions on images")
    parser.add_argument("stems", nargs="*", help="Image stems (e.g., IMG_1358)")
    parser.add_argument("--all", action="store_true", help="Process all images with bbox data")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of images when using --all")
    parser.add_argument("--y-tol", type=float, default=0.03, help="Y tolerance for clustering")
    parser.add_argument("--gap", type=float, default=0.02, help="Region gap threshold for clustering")
    args = parser.parse_args()

    if args.all:
        stems = sorted(f.stem for f in BBOXES_DIR.glob("IMG_*.json"))
        if args.limit > 0:
            stems = stems[:args.limit]
    elif args.stems:
        stems = args.stems
    else:
        print("Usage: visualize_bboxes.py IMG_1358 [IMG_1359 ...] or --all")
        sys.exit(1)

    print(f"Visualizing {len(stems)} images (y_tol={args.y_tol}, gap={args.gap})")

    for i, stem in enumerate(stems, 1):
        print(f"[{i}/{len(stems)}] {stem}", end="")
        result = draw_overlays(stem, args.y_tol, args.gap)
        if result:
            path, n_obs, n_regions = result
            print(f" — {n_obs} obs, {n_regions} regions → {path}")
        else:
            print(" — skipped")

    print(f"\nDone. Output in {OUTPUT_DIR}/")


if __name__ == "__main__":
    main()

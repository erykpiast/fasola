#!/usr/bin/env python3
"""
OCR recipe photos from example-recipes/ using Apple Vision framework,
capturing bounding boxes and confidence for each text observation.

Output: tools/title-loop/bboxes/{IMAGE_STEM}.json  (per image)
        tools/title-loop/bboxes/_all.json           (combined)

Flags:
    --dewarp      Apply page dewarping before OCR
    --visualize   Save annotated image with bbox overlays (requires --dewarp)
    --limit N     Process only first N images

No Claude CLI calls — fully offline, runs unattended.
"""

import argparse
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

import Vision
from AppKit import NSImage, NSBitmapImageRep
from Quartz import CGImageGetWidth, CGImageGetHeight

REPO_ROOT = Path(__file__).parent.parent.parent
OUTPUT_DIR = Path(__file__).parent / "bboxes"
VIS_DIR = OUTPUT_DIR / "visualized"
IMAGES_DIR = REPO_ROOT / "example-recipes"
IMAGE_EXTENSIONS = ("*.jpg", "*.jpeg", "*.png", "*.heic", "*.HEIC", "*.JPG", "*.JPEG", "*.PNG")


def find_images():
    files = []
    for ext in IMAGE_EXTENSIONS:
        files.extend(IMAGES_DIR.glob(ext))
    return sorted(set(files))


def load_nsimage(image_path: Path) -> NSImage | None:
    """Load image via NSImage (auto-applies EXIF orientation → portrait)."""
    return NSImage.alloc().initWithContentsOfFile_(str(image_path))


def nsimage_to_cgimage(ns_image: NSImage):
    """Convert NSImage to CGImage."""
    bitmap = NSBitmapImageRep.alloc().initWithData_(ns_image.TIFFRepresentation())
    if bitmap is None:
        return None
    return bitmap.CGImage()


def dewarp_image(image_path: Path) -> tuple[Path | None, str | None]:
    """Apply page dewarping. Returns (dewarped_png_path, tmp_dir) or (None, None)."""
    try:
        os.environ.setdefault("MPLBACKEND", "Agg")
        from page_dewarp.image import WarpedImage
        from page_dewarp.options import Config
    except ImportError:
        return None, None

    ns_image = load_nsimage(image_path)
    if ns_image is None:
        return None, None

    tmp_dir = tempfile.mkdtemp(prefix="dewarp_")
    try:
        bitmap = NSBitmapImageRep.alloc().initWithData_(ns_image.TIFFRepresentation())
        if bitmap is None:
            shutil.rmtree(tmp_dir, ignore_errors=True)
            return None, None
        png_data = bitmap.representationUsingType_properties_(4, None)
        tmp_input = Path(tmp_dir) / "input.png"
        png_data.writeToFile_atomically_(str(tmp_input), True)

        warped = WarpedImage(tmp_input, config=Config(NO_BINARY=1, OUTPUT_ZOOM=1.0))
        if warped.written:
            return Path(warped.outfile), tmp_dir
        shutil.rmtree(tmp_dir, ignore_errors=True)
        return None, None
    except Exception:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        return None, None


def run_ocr(cg_image) -> list[dict]:
    """Run Apple Vision OCR on a CGImage. Returns observations with bounding boxes."""
    request = Vision.VNRecognizeTextRequest.alloc().init()
    request.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
    request.setRecognitionLanguages_(["pl", "en", "ko"])
    request.setUsesLanguageCorrection_(True)

    handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(cg_image, None)
    success = handler.performRequests_error_([request], None)
    if not success[0]:
        return []

    results = request.results()
    if not results:
        return []

    observations = []
    for observation in results:
        candidate = observation.topCandidates_(1)
        if not candidate:
            continue

        text = candidate[0].string()
        confidence = float(observation.confidence())

        bb = observation.boundingBox()
        x = float(bb.origin.x)
        y_bottom = float(bb.origin.y)
        w = float(bb.size.width)
        h = float(bb.size.height)
        y_top = 1.0 - y_bottom - h

        observations.append({
            "text": text,
            "confidence": round(confidence, 4),
            "bbox": {
                "x": round(x, 6),
                "y": round(y_top, 6),
                "width": round(w, 6),
                "height": round(h, 6),
            },
        })

    return observations


def draw_visualization(ns_image: NSImage, observations: list[dict], output_path: Path,
                       y_tolerance: float = 0.03, region_gap: float = 0.02):
    """Draw observation boxes (blue) and clustered region boundaries (yellow/green) on the image."""
    from AppKit import NSColor, NSBezierPath, NSFont, NSString
    from AppKit import NSFontAttributeName, NSForegroundColorAttributeName
    from Foundation import NSMakeRect, NSDictionary

    sys.path.insert(0, str(Path(__file__).parent))
    from analyze_bboxes import cluster_into_regions, score_title_region

    size = ns_image.size()
    w, h = size.width, size.height

    regions = cluster_into_regions(observations, y_tolerance=y_tolerance, region_gap=region_gap)

    # Score regions for title
    title_idx = -1
    if len(regions) >= 1:
        scores = [(score_title_region(r, regions), i) for i, r in enumerate(regions)]
        scores.sort(key=lambda x: -x[0])
        title_idx = scores[0][1]

    ns_image.lockFocus()

    # --- Draw individual observations (semi-transparent blue) ---
    blue_fill = NSColor.colorWithCalibratedRed_green_blue_alpha_(0.2, 0.4, 1.0, 0.25)
    blue_border = NSColor.colorWithCalibratedRed_green_blue_alpha_(0.2, 0.4, 1.0, 0.6)

    for obs in observations:
        b = obs["bbox"]
        rx = b["x"] * w
        ry = (1.0 - b["y"] - b["height"]) * h
        rw = b["width"] * w
        rh = b["height"] * h
        rect = NSMakeRect(rx, ry, rw, rh)

        blue_fill.set()
        NSBezierPath.fillRect_(rect)
        blue_border.set()
        path = NSBezierPath.bezierPathWithRect_(rect)
        path.setLineWidth_(1.0)
        path.stroke()

    # --- Draw clustered regions (yellow border, green for title) ---
    yellow = NSColor.colorWithCalibratedRed_green_blue_alpha_(1.0, 0.9, 0.0, 0.9)
    green = NSColor.colorWithCalibratedRed_green_blue_alpha_(0.0, 1.0, 0.0, 0.9)
    white_bg = NSColor.colorWithCalibratedRed_green_blue_alpha_(1.0, 1.0, 1.0, 0.85)
    font = NSFont.boldSystemFontOfSize_(max(14, h / 60))

    for i, region in enumerate(regions):
        b = region["bbox"]
        rx = b["x"] * w
        ry = (1.0 - b["y"] - b["height"]) * h
        rw = b["width"] * w
        rh = b["height"] * h
        rect = NSMakeRect(rx, ry, rw, rh)

        color = green if i == title_idx else yellow
        color.set()
        path = NSBezierPath.bezierPathWithRect_(rect)
        path.setLineWidth_(3.0)
        path.stroke()

        # Label
        score = score_title_region(region, regions)
        label = f"R{i}: {region['lines']}L score={score:.2f}"
        attrs = NSDictionary.dictionaryWithObjects_forKeys_(
            [font, color], [NSFontAttributeName, NSForegroundColorAttributeName]
        )
        label_str = NSString.stringWithString_(label)
        label_size = label_str.sizeWithAttributes_(attrs)
        bg_rect = NSMakeRect(rx, ry + rh - label_size.height - 4, label_size.width + 6, label_size.height + 4)
        white_bg.set()
        NSBezierPath.fillRect_(bg_rect)
        label_str.drawAtPoint_withAttributes_((rx + 3, ry + rh - label_size.height - 2), attrs)

    ns_image.unlockFocus()

    # Save as PNG
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tiff_data = ns_image.TIFFRepresentation()
    bitmap = NSBitmapImageRep.alloc().initWithData_(tiff_data)
    png_data = bitmap.representationUsingType_properties_(4, None)
    png_data.writeToFile_atomically_(str(output_path), True)


def main():
    parser = argparse.ArgumentParser(description="Extract bounding boxes from recipe images via Apple Vision OCR")
    parser.add_argument("--limit", type=int, default=0, help="Process only first N images (0 = all)")
    parser.add_argument("--dewarp", action="store_true", help="Apply page dewarping before OCR")
    parser.add_argument("--visualize", action="store_true", help="Save annotated image with bbox overlays")
    args = parser.parse_args()

    images = find_images()
    if not images:
        print(f"No images found in {IMAGES_DIR}")
        sys.exit(1)

    if args.limit > 0:
        images = images[: args.limit]

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Processing {len(images)} images → {OUTPUT_DIR}/")
    if args.dewarp:
        print("  Dewarping enabled")
    if args.visualize:
        print(f"  Visualization → {VIS_DIR}/")

    all_results = []
    processed = 0
    skipped = 0

    for i, image_path in enumerate(images, 1):
        print(f"[{i}/{len(images)}] {image_path.name}", end="", flush=True)

        dewarped_path = None
        tmp_dir = None
        ocr_source_nsimage = None

        if args.dewarp:
            dewarped_path, tmp_dir = dewarp_image(image_path)

        if dewarped_path:
            ocr_source_nsimage = load_nsimage(dewarped_path)
            cg_image = nsimage_to_cgimage(ocr_source_nsimage) if ocr_source_nsimage else None
        else:
            ns_image = load_nsimage(image_path)
            if ns_image:
                ocr_source_nsimage = ns_image
                cg_image = nsimage_to_cgimage(ns_image)
            else:
                cg_image = None

        if cg_image is None:
            print(" — could not load, skipping")
            skipped += 1
            if tmp_dir:
                shutil.rmtree(tmp_dir, ignore_errors=True)
            continue

        observations = run_ocr(cg_image)
        if not observations:
            print(" — no text, skipping")
            skipped += 1
            if tmp_dir:
                shutil.rmtree(tmp_dir, ignore_errors=True)
            continue

        # Save visualization if requested
        if args.visualize and ocr_source_nsimage:
            vis_path = VIS_DIR / f"{image_path.stem}.png"
            draw_visualization(ocr_source_nsimage, observations, vis_path)

        # Clean up temp dir
        if tmp_dir:
            shutil.rmtree(tmp_dir, ignore_errors=True)

        entry = {
            "image": image_path.name,
            "observation_count": len(observations),
            "observations": observations,
        }

        per_image_path = OUTPUT_DIR / f"{image_path.stem}.json"
        per_image_path.write_text(json.dumps(entry, ensure_ascii=False, indent=2), encoding="utf-8")

        all_results.append(entry)
        processed += 1
        print(f" — {len(observations)} observations")

    # Combined JSON
    combined_path = OUTPUT_DIR / "_all.json"
    combined_path.write_text(json.dumps(all_results, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\nDone: {processed} processed, {skipped} skipped")
    print(f"Combined output: {combined_path}")


if __name__ == "__main__":
    main()

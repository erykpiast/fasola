#!/usr/bin/env python3
"""
OCR recipe photos from example-recipes/ using Apple Vision framework,
capturing bounding boxes and confidence for each text observation.

Output: tools/title-loop/bboxes/{IMAGE_STEM}.json  (per image)
        tools/title-loop/bboxes/_all.json           (combined)

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
IMAGES_DIR = REPO_ROOT / "example-recipes"
IMAGE_EXTENSIONS = ("*.jpg", "*.jpeg", "*.png", "*.heic", "*.HEIC", "*.JPG", "*.JPEG", "*.PNG")


def find_images():
    files = []
    for ext in IMAGE_EXTENSIONS:
        files.extend(IMAGES_DIR.glob(ext))
    return sorted(set(files))


def load_portrait_cgimage(image_path: Path):
    """Load image and normalize to portrait orientation using EXIF metadata.

    NSImage automatically applies EXIF orientation, so a landscape-pixel
    photo with orientation=6 (rotated 90° CW) becomes portrait.
    This ensures OCR bounding boxes align with reading direction:
    y = vertical page position, height = line height (font size proxy).
    """
    ns_image = NSImage.alloc().initWithContentsOfFile_(str(image_path))
    if ns_image is None:
        return None
    bitmap = NSBitmapImageRep.alloc().initWithData_(ns_image.TIFFRepresentation())
    if bitmap is None:
        return None
    return bitmap.CGImage()


def dewarp_image(image_path: Path) -> Path | None:
    """Apply page dewarping using page-dewarp library. Returns path to dewarped PNG, or None on failure."""
    try:
        os.environ.setdefault("MPLBACKEND", "Agg")
        import cv2
        from page_dewarp.image import WarpedImage
        from page_dewarp.options import Config
    except ImportError:
        return None

    # page-dewarp needs a cv2-readable format; convert HEIC to PNG first
    ns_image = NSImage.alloc().initWithContentsOfFile_(str(image_path))
    if ns_image is None:
        return None

    tmp_dir = tempfile.mkdtemp(prefix="dewarp_")
    try:
        # Write portrait-oriented PNG
        bitmap = NSBitmapImageRep.alloc().initWithData_(ns_image.TIFFRepresentation())
        if bitmap is None:
            shutil.rmtree(tmp_dir, ignore_errors=True)
            return None
        png_data = bitmap.representationUsingType_properties_(4, None)  # NSBitmapImageFileTypePNG
        tmp_input = Path(tmp_dir) / "input.png"
        png_data.writeToFile_atomically_(str(tmp_input), True)

        warped = WarpedImage(tmp_input, config=Config(NO_BINARY=1, OUTPUT_ZOOM=1.0))
        if warped.written:
            # Return the path; caller should clean up tmp_dir after use
            # (for now we leave it — OCR reads it immediately after)
            return Path(warped.outfile)
        shutil.rmtree(tmp_dir, ignore_errors=True)
        return None
    except Exception:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        return None


def load_cgimage_from_path(path: Path):
    """Load a CGImage from any image file path."""
    ns_image = NSImage.alloc().initWithContentsOfFile_(str(path))
    if ns_image is None:
        return None
    bitmap = NSBitmapImageRep.alloc().initWithData_(ns_image.TIFFRepresentation())
    if bitmap is None:
        return None
    return bitmap.CGImage()


def ocr_image_with_bboxes(image_path: Path, dewarp: bool = False) -> list[dict]:
    """Run Apple Vision OCR on a portrait-normalized (optionally dewarped) image."""
    dewarped_path = None
    if dewarp:
        dewarped_path = dewarp_image(image_path)

    if dewarped_path:
        cg_image = load_cgimage_from_path(dewarped_path)
    else:
        cg_image = load_portrait_cgimage(image_path)

    if cg_image is None:
        print(f"  Could not load image: {image_path.name}")
        return []

    request = Vision.VNRecognizeTextRequest.alloc().init()
    request.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
    request.setRecognitionLanguages_(["pl", "en", "ko"])
    request.setUsesLanguageCorrection_(True)

    handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(cg_image, None)
    success = handler.performRequests_error_([request], None)
    if not success[0]:
        print(f"  OCR failed: {image_path.name}")
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

        # boundingBox() returns normalized CGRect with bottom-left origin
        bb = observation.boundingBox()
        x = float(bb.origin.x)
        y_bottom = float(bb.origin.y)
        w = float(bb.size.width)
        h = float(bb.size.height)
        # Flip Y to top-left origin
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


def main():
    parser = argparse.ArgumentParser(description="Extract bounding boxes from recipe images via Apple Vision OCR")
    parser.add_argument("--limit", type=int, default=0, help="Process only first N images (0 = all)")
    parser.add_argument("--dewarp", action="store_true", help="Apply page dewarping before OCR")
    args = parser.parse_args()

    images = find_images()
    if not images:
        print(f"No images found in {IMAGES_DIR}")
        sys.exit(1)

    if args.limit > 0:
        images = images[: args.limit]

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Processing {len(images)} images → {OUTPUT_DIR}/")

    all_results = []
    processed = 0
    skipped = 0

    for i, image_path in enumerate(images, 1):
        print(f"[{i}/{len(images)}] {image_path.name}", end="")

        observations = ocr_image_with_bboxes(image_path, dewarp=args.dewarp)
        if not observations:
            print(" — no text, skipping")
            skipped += 1
            continue

        entry = {
            "image": image_path.name,
            "observation_count": len(observations),
            "observations": observations,
        }

        # Per-image JSON
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

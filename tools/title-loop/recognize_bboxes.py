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
import sys
from pathlib import Path

import Vision
from Foundation import NSURL
from Quartz import (
    CGImageSourceCreateWithURL,
    CGImageSourceCreateImageAtIndex,
)

REPO_ROOT = Path(__file__).parent.parent.parent
OUTPUT_DIR = Path(__file__).parent / "bboxes"
IMAGES_DIR = REPO_ROOT / "example-recipes"
IMAGE_EXTENSIONS = ("*.jpg", "*.jpeg", "*.png", "*.heic", "*.HEIC", "*.JPG", "*.JPEG", "*.PNG")


def find_images():
    files = []
    for ext in IMAGE_EXTENSIONS:
        files.extend(IMAGES_DIR.glob(ext))
    return sorted(set(files))


def ocr_image_with_bboxes(image_path: Path) -> list[dict]:
    """Run Apple Vision OCR on a single image. Returns list of observations with bounding boxes."""
    url = NSURL.fileURLWithPath_(str(image_path))
    source = CGImageSourceCreateWithURL(url, None)
    if source is None:
        print(f"  Could not load image: {image_path.name}")
        return []

    cg_image = CGImageSourceCreateImageAtIndex(source, 0, None)
    if cg_image is None:
        print(f"  Could not create CGImage: {image_path.name}")
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

        observations = ocr_image_with_bboxes(image_path)
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

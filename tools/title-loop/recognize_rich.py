#!/usr/bin/env python3
"""
OCR recipe photos from ~/Downloads using Apple Vision framework,
then extract recipe titles using Claude Haiku.

Recognized images are moved to example-recipes/.
Output: tools/title-loop/input/{RECOGNIZED_TITLE}.real.txt
"""

import shutil
import subprocess
import sys
from pathlib import Path

from lang_detect import detect_language

import Vision
from Foundation import NSURL
from Quartz import (
    CGImageSourceCreateWithURL,
    CGImageSourceCreateImageAtIndex,
)

REPO_ROOT = Path(__file__).parent.parent.parent
OUTPUT_DIR = Path(__file__).parent / "input"
IMAGES_DIR = Path.home() / "Downloads"
ARCHIVE_DIR = REPO_ROOT / "example-recipes"
IMAGE_EXTENSIONS = ("*.jpg", "*.jpeg", "*.png", "*.heic", "*.HEIC", "*.JPG", "*.JPEG", "*.PNG")


def find_images():
    files = []
    for ext in IMAGE_EXTENSIONS:
        files.extend(IMAGES_DIR.glob(ext))
    return sorted(set(files))


def ocr_image(image_path: Path) -> str:
    """Run Apple Vision OCR on a single image. Returns recognized text."""
    url = NSURL.fileURLWithPath_(str(image_path))
    source = CGImageSourceCreateWithURL(url, None)
    if source is None:
        print(f"  Could not load image: {image_path.name}")
        return ""

    cg_image = CGImageSourceCreateImageAtIndex(source, 0, None)
    if cg_image is None:
        print(f"  Could not create CGImage: {image_path.name}")
        return ""

    request = Vision.VNRecognizeTextRequest.alloc().init()
    request.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
    request.setRecognitionLanguages_(["pl", "en", "ko"])
    request.setUsesLanguageCorrection_(True)

    handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(cg_image, None)
    success = handler.performRequests_error_([request], None)
    if not success[0]:
        print(f"  OCR failed: {image_path.name}")
        return ""

    results = request.results()
    if not results:
        return ""

    lines = []
    for observation in results:
        candidate = observation.topCandidates_(1)
        if candidate:
            lines.append(candidate[0].string())

    return "\n".join(lines)


def extract_title(ocr_text: str) -> str | None:
    """Use Claude Code CLI (haiku) to extract the recipe title from OCR text."""
    prompt = (
        "Below is OCR text from a recipe photo. Extract the recipe title. "
        "Return ONLY the title, nothing else. Keep the original language. "
        "If there are multiple recipes, join them with ' : '. "
        "If you cannot determine a title, respond with exactly: UNKNOWN\n\n"
        f"---\n{ocr_text}\n---"
    )
    result = subprocess.run(
        ["claude", "-p", "--model", "haiku", prompt],
        capture_output=True,
        text=True,
        stdin=subprocess.DEVNULL,
        timeout=60,
    )
    if result.returncode != 0:
        print(f"  claude CLI error: {(result.stderr or result.stdout).strip()}")
        return None
    title = result.stdout.strip()
    if not title or title == "UNKNOWN":
        return None
    return title


def sanitize_filename(title: str) -> str:
    """Remove characters that are problematic in filenames."""
    bad_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|']
    result = title
    for c in bad_chars:
        result = result.replace(c, ' ')
    # Collapse multiple spaces
    result = ' '.join(result.split())
    return result.strip()


def main():
    images = find_images()
    if not images:
        print(f"No images found in {IMAGES_DIR}")
        sys.exit(1)

    print(f"Found {len(images)} images in {IMAGES_DIR}")

    processed = 0
    skipped = 0
    failed = 0

    for i, image_path in enumerate(images, 1):
        print(f"\n[{i}/{len(images)}] {image_path.name}")

        # OCR
        ocr_text = ocr_image(image_path)
        if not ocr_text.strip():
            print("  No text recognized, skipping")
            skipped += 1
            continue

        line_count = len(ocr_text.splitlines())
        print(f"  OCR: {line_count} lines")

        # Heuristic: if very little text, probably not a recipe
        if line_count < 3:
            print("  Too little text, skipping")
            skipped += 1
            continue

        # Extract title
        title = extract_title(ocr_text)
        if not title:
            print("  Could not extract title, skipping")
            failed += 1
            continue

        safe_title = sanitize_filename(title)
        lang = detect_language(ocr_text)
        output_path = OUTPUT_DIR / f"{safe_title}.{lang}.real.txt"

        if output_path.exists():
            print(f"  Already exists: {safe_title}.{lang}.real.txt, skipping")
            skipped += 1
            continue

        output_path.write_text(ocr_text, encoding="utf-8")
        print(f"  -> {safe_title}.{lang}.real.txt ({lang.upper()})")

        # Move processed image to example-recipes/
        dest = ARCHIVE_DIR / image_path.name
        shutil.move(str(image_path), str(dest))
        print(f"  Moved to {dest.relative_to(REPO_ROOT)}")
        processed += 1

    print(f"\nDone: {processed} saved, {skipped} skipped, {failed} failed")


if __name__ == "__main__":
    main()

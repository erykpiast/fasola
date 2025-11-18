#!/bin/bash

# Test script wrapper for the photo-processor pipeline
# Makes it easier to run the test without remembering the full command

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Check if an image path was provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <image-path>"
    echo ""
    echo "Example:"
    echo "  $0 pipelines/test-images/book.jpeg"
    echo "  $0 /path/to/your/image.jpg"
    exit 1
fi

IMAGE_PATH="$1"

# Convert relative paths to absolute paths
if [[ ! "$IMAGE_PATH" = /* ]]; then
    # If path is relative, make it relative to script directory
    IMAGE_PATH="$SCRIPT_DIR/$IMAGE_PATH"
fi

# Check if the image exists
if [ ! -f "$IMAGE_PATH" ]; then
    echo "Error: Image file not found: $IMAGE_PATH"
    exit 1
fi

# Check if required dependencies are installed
if ! command -v npx &> /dev/null; then
    echo "Error: npx not found. Please install Node.js and npm."
    exit 1
fi

# Check if canvas and tsx are installed
cd "$PROJECT_ROOT"
if ! npm list canvas &> /dev/null || ! npm list tsx &> /dev/null; then
    echo "Installing required dependencies (canvas, tsx)..."
    npm install --save-dev canvas tsx
fi

echo "Running photo-processor pipeline test..."
echo ""

# Run the test script
cd "$PROJECT_ROOT" && npx tsx lib/photo-processor/test-pipeline.ts "$IMAGE_PATH"


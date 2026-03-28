#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "=== Step 1: Extracting bounding boxes from recipe images ==="
python3 recognize_bboxes.py

echo ""
echo "=== Step 2: Analyzing merging strategies ==="
python3 analyze_bboxes.py

echo ""
echo "=== Done. Results in bboxes/_analysis_report.json ==="

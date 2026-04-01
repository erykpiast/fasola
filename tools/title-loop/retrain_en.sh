#!/usr/bin/env bash
# Retrain EN title model (bert-base-cased), export to .pte, and upload to HuggingFace.
# Run from repo root: bash tools/title-loop/retrain_en.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Training venv has transformers, torch, datasets, seqeval
TRAIN_PYTHON=".venv/bin/python3"
# Export venv has executorch + torchao (requires Python 3.12, see requirements-export.txt)
EXPORT_PYTHON=".venv-export/bin/python3"

echo "=== Step 0: Re-tokenize training data with bert-base-cased ==="
$TRAIN_PYTHON prepare_training_data.py --lang en
echo "  Data re-tokenized"

echo ""
echo "=== Step 1: Resplit data (85/15 train/val) ==="
$TRAIN_PYTHON -c "
import json, random
random.seed(42)
data_dir = 'data/en'
lines = []
for split in ['train', 'val']:
    with open(f'{data_dir}/{split}.jsonl') as f:
        lines.extend(f.readlines())
random.shuffle(lines)
n_val = max(int(len(lines) * 0.15), 20)
val, train = lines[:n_val], lines[n_val:]
with open(f'{data_dir}/train.jsonl', 'w') as f:
    f.writelines(train)
with open(f'{data_dir}/val.jsonl', 'w') as f:
    f.writelines(val)
print(f'  Train: {len(train)}, Val: {len(val)} (test unchanged)')
"

echo ""
echo "=== Step 2: Train bert-base-cased (layers 10-11 unfrozen, 15 epochs) ==="
$TRAIN_PYTHON train_title_model.py --lang en
echo "  Training complete"

echo ""
echo "=== Step 3: Evaluate ==="
$TRAIN_PYTHON eval_model.py --lang en
echo "  Evaluation complete"

echo ""
echo "=== Step 4: Export to .pte (INT8 quantized) ==="
$EXPORT_PYTHON export_to_executorch.py --lang en
echo "  Export complete"

echo ""
echo "=== Step 5: Upload to HuggingFace ==="
REPO="erykpiast/fasola-title-extractor-en"
EXPORT_DIR="models/export/en"

hf upload "$REPO" \
  "$EXPORT_DIR/title_extractor_xnnpack.pte" \
  title_extractor_xnnpack.pte

hf upload "$REPO" \
  "$EXPORT_DIR/tokenizer/tokenizer.json" \
  tokenizer.json

echo ""
echo "=== Done ==="
echo "Uploaded to https://huggingface.co/$REPO"
echo "Test on device by rebuilding the app."

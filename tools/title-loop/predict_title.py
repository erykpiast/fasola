#!/usr/bin/env python3
"""
Predict recipe title from OCR text using a trained per-language model.

Usage:
    python3 tools/title-loop/predict_title.py --lang pl recipe.txt
    echo "ŻUREK\n1 szklanka zakwasu..." | python3 tools/title-loop/predict_title.py --lang pl
"""

import argparse
import sys
from pathlib import Path

import torch
from transformers import AutoModelForTokenClassification, AutoTokenizer

MODELS_DIR = Path(__file__).parent / "models"
MAX_SEQ_LEN = 512


def predict(model, tokenizer, text, device):
    encoding = tokenizer(
        text, max_length=MAX_SEQ_LEN, truncation=True,
        padding="max_length", return_tensors="pt",
    )
    input_ids = encoding["input_ids"].to(device)
    attention_mask = encoding["attention_mask"].to(device)

    with torch.no_grad():
        logits = model(input_ids=input_ids, attention_mask=attention_mask).logits

    preds = torch.argmax(logits, dim=-1)[0].cpu().numpy()
    ids = input_ids[0].cpu().numpy()
    seq_len = int(attention_mask[0].sum().item())

    title_ids = []
    in_title = False
    for i in range(seq_len):
        if preds[i] == 1:  # B-TITLE
            in_title = True
            title_ids.append(ids[i])
        elif preds[i] == 2 and in_title:  # I-TITLE
            title_ids.append(ids[i])
        elif in_title:
            break

    if not title_ids:
        return None
    return tokenizer.decode(title_ids, skip_special_tokens=True).strip()


def main():
    parser = argparse.ArgumentParser(description="Predict recipe title from OCR text")
    parser.add_argument("file", nargs="?", help="Text file (reads stdin if omitted)")
    parser.add_argument("--lang", required=True, choices=["pl", "en"])
    args = parser.parse_args()

    model_path = MODELS_DIR / args.lang / "best"
    if not model_path.exists():
        print(f"Model not found at {model_path}", file=sys.stderr)
        sys.exit(1)

    if args.file:
        text = Path(args.file).read_text(encoding="utf-8")
    else:
        text = sys.stdin.read()

    if not text.strip():
        print("No input text", file=sys.stderr)
        sys.exit(1)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    model = AutoModelForTokenClassification.from_pretrained(model_path).to(device)
    model.eval()

    title = predict(model, tokenizer, text, device)
    if title:
        print(title)
    else:
        print("(no title found)", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

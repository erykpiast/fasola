#!/usr/bin/env python3
"""
Evaluate the trained title extraction model per language.

Usage:
    python3 tools/title-loop/eval_model.py --lang pl
    python3 tools/title-loop/eval_model.py --lang en
    python3 tools/title-loop/eval_model.py --lang pl --model-path path/to/model
"""

import argparse
import json
import re
import unicodedata
from pathlib import Path

import numpy as np
import torch
from transformers import AutoModelForTokenClassification, AutoTokenizer

from lang_detect import detect_file_language

INPUT_DIR = Path(__file__).parent / "input"
MODELS_DIR = Path(__file__).parent / "models"
MAX_SEQ_LEN = 512


# ── Matching logic (from eval_only.py) ────────────────────────────────────────

def normalize(s):
    return re.sub(r"\s+", " ", s.strip()).upper()

def strip_diacritics(s):
    s = s.replace("ł", "l").replace("Ł", "L")
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )

def ocr_normalize(s):
    return s.replace("0", "O").replace("1", "I").replace("5", "S")

def titles_match(extracted, expected):
    if not extracted:
        return False
    extracted_norm = ocr_normalize(
        strip_diacritics(normalize(extracted).replace("-", " ").replace("_", " "))
    )
    expected_parts = [
        ocr_normalize(
            strip_diacritics(normalize(p).replace("-", " ").replace("_", " "))
        )
        for p in expected.split("+")
    ]
    return all(part in extracted_norm for part in expected_parts)


_PATTERN_SUFFIX_RE = re.compile(
    r"\.(simple|spillover|split_title|metadata|corruption|narrative|compound|"
    r"multi_language|category_season|servings_before|timing_before|corrupted|"
    r"catastrophic|website|multilang|pipe|aug\d+)$"
)

def extract_expected_title(filename):
    name = Path(filename).name
    cleaned = re.sub(r"\.(real|generated)\.txt$", "", name)
    cleaned = _PATTERN_SUFFIX_RE.sub("", cleaned)
    return cleaned


# ── Model inference ───────────────────────────────────────────────────────────

def predict_title(model, tokenizer, text, device):
    encoding = tokenizer(
        text,
        max_length=MAX_SEQ_LEN,
        truncation=True,
        padding="max_length",
        return_tensors="pt",
    )

    input_ids = encoding["input_ids"].to(device)
    attention_mask = encoding["attention_mask"].to(device)

    with torch.no_grad():
        outputs = model(input_ids=input_ids, attention_mask=attention_mask)
        logits = outputs.logits

    pred_labels = torch.argmax(logits, dim=-1)[0].cpu().numpy()
    token_ids = input_ids[0].cpu().numpy()

    # Handle long texts with sliding window
    all_tokens = tokenizer.encode(text)
    if len(all_tokens) > MAX_SEQ_LEN:
        best_title = _predict_with_sliding_window(model, tokenizer, text, device)
        if best_title:
            return best_title

    title_ids = []
    in_title = False
    for label, tid in zip(pred_labels, token_ids):
        if label == 1:
            in_title = True
            title_ids.append(tid)
        elif label == 2 and in_title:
            title_ids.append(tid)
        else:
            if in_title:
                break

    if not title_ids:
        return ""
    return tokenizer.decode(title_ids, skip_special_tokens=True).strip()


def _predict_with_sliding_window(model, tokenizer, text, device):
    lines = text.split("\n")
    best_title = ""
    best_title_token_count = 0

    stride = len(lines) // 4 or 1
    for start in range(0, len(lines), stride):
        lo, hi = start, min(start + 1, len(lines) - 1)
        while lo > 0 or hi < len(lines) - 1:
            candidate = "\n".join(lines[lo : hi + 1])
            if len(tokenizer.encode(candidate)) >= MAX_SEQ_LEN - 10:
                break
            if lo > 0:
                lo -= 1
            if hi < len(lines) - 1:
                hi += 1

        window_text = "\n".join(lines[lo : hi + 1])
        encoding = tokenizer(
            window_text, max_length=MAX_SEQ_LEN, truncation=True,
            padding="max_length", return_tensors="pt",
        )
        input_ids = encoding["input_ids"].to(device)
        attention_mask = encoding["attention_mask"].to(device)

        with torch.no_grad():
            outputs = model(input_ids=input_ids, attention_mask=attention_mask)
            logits = outputs.logits

        pred_labels = torch.argmax(logits, dim=-1)[0].cpu().numpy()
        token_ids = input_ids[0].cpu().numpy()

        title_count = sum(1 for l in pred_labels if l in (1, 2))
        if title_count > best_title_token_count:
            best_title_token_count = title_count
            title_ids = []
            in_title = False
            for label, tid in zip(pred_labels, token_ids):
                if label == 1:
                    in_title = True
                    title_ids.append(tid)
                elif label == 2 and in_title:
                    title_ids.append(tid)
                else:
                    if in_title:
                        break
            if title_ids:
                best_title = tokenizer.decode(title_ids, skip_special_tokens=True).strip()

    return best_title


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lang", required=True, choices=["pl", "en"])
    parser.add_argument("--model-path", type=str, default=None)
    args = parser.parse_args()

    lang = args.lang
    model_path = Path(args.model_path) if args.model_path else MODELS_DIR / lang / "best"

    print(f"Loading {lang.upper()} model from {model_path}")
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    model = AutoModelForTokenClassification.from_pretrained(model_path).to(device)
    model.eval()

    # Filter files by language
    real_files = sorted(f for f in INPUT_DIR.glob("*.real.txt") if detect_file_language(f) == lang)
    gen_files = sorted(f for f in INPUT_DIR.glob("*.generated.txt") if detect_file_language(f) == lang)

    print(f"Real files ({lang}): {len(real_files)}, Generated files ({lang}): {len(gen_files)}")

    print(f"\n--- REAL FILES ({lang.upper()}) ---")
    real_results = []
    for fp in real_files:
        expected = extract_expected_title(fp.name)
        text = fp.read_text(encoding="utf-8")
        extracted = predict_title(model, tokenizer, text, device)
        match = titles_match(extracted, expected)
        real_results.append({"expected": expected, "extracted": extracted, "match": match})
        status = "YES" if match else "NO"
        print(f"  {status}: expected={expected!r} got={extracted!r}")

    print(f"\n--- GENERATED FILES ({lang.upper()}) ---")
    gen_results = []
    for fp in gen_files:
        expected = extract_expected_title(fp.name)
        text = fp.read_text(encoding="utf-8")
        extracted = predict_title(model, tokenizer, text, device)
        match = titles_match(extracted, expected)
        gen_results.append({"expected": expected, "extracted": extracted, "match": match})
        if not match:
            print(f"  NO: expected={expected!r} got={extracted!r}")

    real_pass = sum(1 for r in real_results if r["match"])
    gen_pass = sum(1 for r in gen_results if r["match"])
    total = len(real_results) + len(gen_results)
    all_pass = real_pass + gen_pass

    real_acc = real_pass / len(real_results) if real_results else 0
    gen_acc = gen_pass / len(gen_results) if gen_results else 0
    combined_acc = all_pass / total if total else 0

    print(f"\n{'='*50}")
    print(f"Model Results ({lang.upper()}):")
    print(f"  Real:      {real_pass}/{len(real_results)} = {real_acc:.1%}")
    print(f"  Generated: {gen_pass}/{len(gen_results)} = {gen_acc:.1%}")
    print(f"  Combined:  {all_pass}/{total} = {combined_acc:.1%}")
    print(f"{'='*50}")

    results_path = model_path.parent / f"eval_results_{lang}.json"
    with open(results_path, "w") as f:
        json.dump({
            "lang": lang,
            "real_accuracy": real_acc,
            "generated_accuracy": gen_acc,
            "combined_accuracy": combined_acc,
            "real_total": len(real_results),
            "gen_total": len(gen_results),
            "failures": [r for r in real_results + gen_results if not r["match"]],
        }, f, indent=2, ensure_ascii=False)
    print(f"\nDetailed results written to {results_path}")


if __name__ == "__main__":
    main()

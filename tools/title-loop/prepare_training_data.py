#!/usr/bin/env python3
"""
Prepare BIO-tagged training data for title extraction model.

Reads .real.txt and .generated.txt files from tools/title-loop/input/,
filters by language, fuzzy-aligns ground truth titles to OCR text,
and produces tokenized JSONL datasets.

Usage:
    python3 tools/title-loop/prepare_training_data.py --lang pl
    python3 tools/title-loop/prepare_training_data.py --lang en

Output: tools/title-loop/data/{lang}/{train,val,test}.jsonl
"""

import argparse
import json
import re
import unicodedata
from pathlib import Path

from Levenshtein import ratio as levenshtein_ratio
from transformers import AutoTokenizer


INPUT_DIR = Path(__file__).parent / "input"
DATA_DIR = Path(__file__).parent / "data"

MAX_SEQ_LEN = 512
LABEL_MAP = {"O": 0, "B-TITLE": 1, "I-TITLE": 2}

LANG_CONFIG = {
    "pl": {"model_name": "dkleczek/bert-base-polish-cased-v1"},
    "en": {"model_name": "google-bert/bert-base-cased"},
}

_PATTERN_SUFFIX_RE = re.compile(
    r"\.(simple|spillover|split_title|metadata|corruption|narrative|compound|"
    r"multi_language|category_season|servings_before|timing_before|corrupted|"
    r"catastrophic|website|multilang|pipe|compound|aug\d+)$"
)


# ── Normalization (mirrors eval_only.py) ──────────────────────────────────────

def normalize(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip()).upper()

def strip_diacritics(s: str) -> str:
    s = s.replace("ł", "l").replace("Ł", "L")
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )

def ocr_normalize(s: str) -> str:
    return s.replace("0", "O").replace("1", "I").replace("5", "S")

def full_normalize(s: str) -> str:
    return ocr_normalize(strip_diacritics(normalize(s)))


def extract_expected_title(filename: str) -> str:
    name = Path(filename).name
    cleaned = re.sub(r"\.(pl|en)\.(real|generated)\.txt$", "", name)
    cleaned = _PATTERN_SUFFIX_RE.sub("", cleaned)
    return cleaned


# ── Fuzzy alignment ───────────────────────────────────────────────────────────

def _line_char_offset(lines: list[str], line_idx: int) -> int:
    return sum(len(lines[i]) + 1 for i in range(line_idx))


def find_title_span(text: str, title: str) -> tuple[int, int] | None:
    lines = text.split("\n")
    title_norm = full_normalize(title)

    # Strategy 1: exact case-insensitive substring match
    text_lower = text.lower()
    title_lower = title.lower()
    idx = text_lower.find(title_lower)
    if idx != -1:
        return (idx, idx + len(title))

    # Strategy 2: line-level exact normalized match
    for n_lines in range(1, min(5, len(lines) + 1)):
        for start_line in range(len(lines) - n_lines + 1):
            candidate = " ".join(lines[start_line : start_line + n_lines]).strip()
            if not candidate:
                continue
            if full_normalize(candidate) == title_norm:
                char_start = _line_char_offset(lines, start_line)
                char_end = _line_char_offset(lines, start_line + n_lines) - 1
                return (char_start, char_end)

    # Strategy 3: fuzzy line-level matching
    best_score = 0.0
    best_span = None
    for n_lines in range(1, min(5, len(lines) + 1)):
        for start_line in range(len(lines) - n_lines + 1):
            candidate = " ".join(lines[start_line : start_line + n_lines]).strip()
            if not candidate:
                continue
            score = levenshtein_ratio(full_normalize(candidate), title_norm)
            if score > best_score:
                best_score = score
                char_start = _line_char_offset(lines, start_line)
                char_end = _line_char_offset(lines, start_line + n_lines) - 1
                best_span = (char_start, char_end)

    if best_score >= 0.70:
        return best_span
    return None


def find_compound_title_spans(text: str, title: str) -> list[tuple[int, int]] | None:
    separators = re.split(r"\s*[:\+]\s*", title)
    if len(separators) <= 1:
        return None
    spans = []
    for part in separators:
        part = part.strip()
        if not part:
            continue
        span = find_title_span(text, part)
        if span is None:
            return None
        spans.append(span)
    return spans if spans else None


# ── Sliding window for long texts ────────────────────────────────────────────

def _find_window_containing_span(tokenizer, text, span_start, span_end):
    tokens = tokenizer.encode(text)
    if len(tokens) <= MAX_SEQ_LEN:
        return None

    center_char = (span_start + span_end) // 2
    lines = text.split("\n")
    offset = 0
    center_line = 0
    for i, line in enumerate(lines):
        if offset + len(line) >= center_char:
            center_line = i
            break
        offset += len(line) + 1

    lo = center_line
    hi = center_line
    while lo > 0 or hi < len(lines) - 1:
        candidate = "\n".join(lines[lo:hi + 1])
        if len(tokenizer.encode(candidate)) >= MAX_SEQ_LEN - 10:
            break
        if lo > 0:
            lo -= 1
        if hi < len(lines) - 1:
            hi += 1

    return "\n".join(lines[lo:hi + 1])


# ── BIO labeling ──────────────────────────────────────────────────────────────

def create_bio_labels(tokenizer, text: str, title: str) -> dict | None:
    spans = find_compound_title_spans(text, title)
    if spans is None:
        span = find_title_span(text, title)
        if span is None:
            return None
        spans = [span]

    min_span_start = min(s[0] for s in spans)
    max_span_end = max(s[1] for s in spans)
    windowed = _find_window_containing_span(tokenizer, text, min_span_start, max_span_end)
    if windowed is not None:
        text = windowed
        spans = find_compound_title_spans(text, title)
        if spans is None:
            span = find_title_span(text, title)
            if span is None:
                return None
            spans = [span]

    encoding = tokenizer(
        text,
        max_length=MAX_SEQ_LEN,
        truncation=True,
        padding="max_length",
        return_offsets_mapping=True,
        return_tensors=None,
    )

    offsets = encoding["offset_mapping"]
    input_ids = encoding["input_ids"]
    attention_mask = encoding["attention_mask"]

    max_char = 0
    for i in range(len(offsets) - 1, -1, -1):
        if offsets[i] != (0, 0):
            max_char = offsets[i][1]
            break

    valid_spans = [s for s in spans if s[0] < max_char]
    if not valid_spans:
        return None

    labels = []
    for i, (start, end) in enumerate(offsets):
        if start == 0 and end == 0:
            labels.append(-100)
            continue

        is_title = False
        for span_start, span_end in valid_spans:
            if start < span_end and end > span_start:
                is_title = True
                break

        if is_title:
            is_first = True
            if i > 0:
                prev_start, prev_end = offsets[i - 1]
                if prev_start != 0 or prev_end != 0:
                    for span_start, span_end in valid_spans:
                        if prev_start < span_end and prev_end > span_start:
                            is_first = False
                            break
            labels.append(LABEL_MAP["B-TITLE"] if is_first else LABEL_MAP["I-TITLE"])
        else:
            labels.append(LABEL_MAP["O"])

    return {
        "input_ids": input_ids,
        "attention_mask": attention_mask,
        "labels": labels,
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lang", required=True, choices=["pl", "en"])
    args = parser.parse_args()

    lang = args.lang
    config = LANG_CONFIG[lang]
    output_dir = DATA_DIR / lang
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Language: {lang}")
    print(f"Loading tokenizer: {config['model_name']}")
    tokenizer = AutoTokenizer.from_pretrained(config["model_name"])

    # Collect input files by language suffix
    real_files = sorted(INPUT_DIR.glob(f"*.{lang}.real.txt"))
    gen_files = sorted(INPUT_DIR.glob(f"*.{lang}.generated.txt"))

    print(f"Found {len(real_files)} real + {len(gen_files)} generated {lang.upper()} files")

    # Process files
    real_examples = []
    gen_examples = []
    failed = []

    for fp in real_files:
        title = extract_expected_title(fp.name)
        text = fp.read_text(encoding="utf-8")
        result = create_bio_labels(tokenizer, text, title)
        if result is None:
            failed.append(("real", fp.name, title))
            continue
        result["id"] = fp.stem
        result["expected_title"] = title
        result["source"] = "real"
        real_examples.append(result)

    for fp in gen_files:
        title = extract_expected_title(fp.name)
        text = fp.read_text(encoding="utf-8")
        result = create_bio_labels(tokenizer, text, title)
        if result is None:
            failed.append(("gen", fp.name, title))
            continue
        result["id"] = fp.stem
        result["expected_title"] = title
        result["source"] = "generated"
        gen_examples.append(result)

    print(f"\nAligned: {len(real_examples)} real, {len(gen_examples)} generated")
    print(f"Failed: {len(failed)}")
    if failed:
        for typ, name, title in failed[:20]:
            print(f"  [{typ}] {name} — title: {title!r}")
        if len(failed) > 20:
            print(f"  ... and {len(failed) - 20} more")

    # Split: real 70% train / 15% val / 15% test, generated all in train
    import random
    random.seed(42)
    random.shuffle(real_examples)
    random.shuffle(gen_examples)

    n_real = len(real_examples)
    real_train_end = int(n_real * 0.70)
    real_val_end = int(n_real * 0.85)

    real_train = real_examples[:real_train_end]
    real_val = real_examples[real_train_end:real_val_end]
    real_test = real_examples[real_val_end:]

    train = real_train + gen_examples
    random.shuffle(train)
    val = real_val
    test = real_test

    print(f"\nSplit: train={len(train)} ({len(real_train)} real + {len(gen_examples)} gen), "
          f"val={len(val)} (real), test={len(test)} (real)")

    for name, examples in [("train", train), ("val", val), ("test", test)]:
        path = output_dir / f"{name}.jsonl"
        with open(path, "w", encoding="utf-8") as f:
            for ex in examples:
                f.write(json.dumps(ex, ensure_ascii=False) + "\n")
        print(f"Wrote {path}: {len(examples)} examples")

    for name, examples in [("train", train), ("val", val), ("test", test)]:
        if not examples:
            continue
        total_title_tokens = sum(
            sum(1 for l in ex["labels"] if l in (1, 2))
            for ex in examples
        )
        avg_title_tokens = total_title_tokens / len(examples)
        print(f"  {name}: avg {avg_title_tokens:.1f} title tokens per example")


if __name__ == "__main__":
    main()

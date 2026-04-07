#!/usr/bin/env python3
"""
Fine-tune a language-specific model for recipe title extraction (BIO token classification).

Usage:
    python3 tools/title-loop/train_title_model.py --lang pl
    python3 tools/title-loop/train_title_model.py --lang en

Reads:  tools/title-loop/data/{lang}/{train,val,test}.jsonl
Writes: tools/title-loop/models/{lang}/best/
"""

import argparse
import json
import re
import unicodedata
from pathlib import Path

import numpy as np
import torch
from datasets import Dataset
from seqeval.metrics import f1_score
from transformers import (
    AutoModelForTokenClassification,
    AutoTokenizer,
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
)

DATA_DIR = Path(__file__).parent / "data"
MODELS_DIR = Path(__file__).parent / "models"

ID2LABEL = {0: "O", 1: "B-TITLE", 2: "I-TITLE"}
LABEL2ID = {"O": 0, "B-TITLE": 1, "I-TITLE": 2}

LANG_CONFIG = {
    "pl": {
        "model_name": "dkleczek/bert-base-polish-cased-v1",
        "learning_rate": 2e-5,
        "num_epochs": 20,
        "batch_size": 8,
        "torch_dtype": torch.float32,
    },
    "en": {
        "model_name": "google-bert/bert-base-cased",
        "learning_rate": 2e-5,
        "num_epochs": 15,
        "batch_size": 8,
        "torch_dtype": torch.float32,
        "freeze_layers_below": 10,  # freeze encoder layers 0-9, train 10-11 + classifier
    },
}


# ── Matching logic (from eval_only.py) ────────────────────────────────────────

def _normalize(s):
    return re.sub(r"\s+", " ", s.strip()).upper()

def _strip_diacritics(s):
    s = s.replace("ł", "l").replace("Ł", "L")
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )

def _ocr_normalize(s):
    return s.replace("0", "O").replace("1", "I").replace("5", "S")

def titles_match(extracted, expected):
    if not extracted:
        return False
    extracted_norm = _ocr_normalize(
        _strip_diacritics(_normalize(extracted).replace("-", " ").replace("_", " "))
    )
    expected_parts = [
        _ocr_normalize(
            _strip_diacritics(_normalize(p).replace("-", " ").replace("_", " "))
        )
        for p in expected.split("+")
    ]
    return all(part in extracted_norm for part in expected_parts)


# ── Data loading ──────────────────────────────────────────────────────────────

def load_jsonl(path):
    with open(path) as f:
        return [json.loads(line) for line in f]


def examples_to_dataset(examples):
    return Dataset.from_dict({
        "input_ids": [ex["input_ids"] for ex in examples],
        "attention_mask": [ex["attention_mask"] for ex in examples],
        "labels": [ex["labels"] for ex in examples],
        "expected_title": [ex["expected_title"] for ex in examples],
    })


# ── Metrics ───────────────────────────────────────────────────────────────────

# Global refs for compute_metrics closure
_val_dataset = None
_val_titles = None


def compute_metrics(eval_pred, tokenizer):
    predictions, labels = eval_pred
    pred_labels = np.argmax(predictions, axis=-1)

    # Token-level F1
    true_seqs, pred_seqs = [], []
    for pred_seq, label_seq in zip(pred_labels, labels):
        true_tags, pred_tags = [], []
        for p, l in zip(pred_seq, label_seq):
            if l == -100:
                continue
            true_tags.append(ID2LABEL[l])
            pred_tags.append(ID2LABEL[p])
        true_seqs.append(true_tags)
        pred_seqs.append(pred_tags)

    token_f1 = f1_score(true_seqs, pred_seqs)

    # Span-level accuracy
    span_matches = 0
    input_ids = np.array(_val_dataset["input_ids"])
    for pred_seq, ids, expected in zip(pred_labels, input_ids, _val_titles):
        title_ids = []
        in_title = False
        for label, tid in zip(pred_seq, ids):
            if label == 1:
                in_title = True
                title_ids.append(tid)
            elif label == 2 and in_title:
                title_ids.append(tid)
            else:
                if in_title:
                    break
        if title_ids:
            title = tokenizer.decode(title_ids, skip_special_tokens=True).strip()
            if titles_match(title, expected):
                span_matches += 1

    span_acc = span_matches / len(_val_titles) if _val_titles else 0
    return {"token_f1": token_f1, "span_accuracy": span_acc}


# ── Weighted loss trainer ─────────────────────────────────────────────────────

class WeightedTrainer(Trainer):
    def __init__(self, class_weights=None, **kwargs):
        super().__init__(**kwargs)
        if class_weights is not None:
            self.class_weights = torch.tensor(class_weights, dtype=torch.float32)
        else:
            self.class_weights = None

    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels = inputs.pop("labels")
        outputs = model(**inputs)
        logits = outputs.logits

        if self.class_weights is not None:
            weight = self.class_weights.to(logits.device)
            loss_fn = torch.nn.CrossEntropyLoss(weight=weight, ignore_index=-100)
        else:
            loss_fn = torch.nn.CrossEntropyLoss(ignore_index=-100)

        loss = loss_fn(logits.view(-1, logits.shape[-1]), labels.view(-1))
        return (loss, outputs) if return_outputs else loss


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    global _val_dataset, _val_titles

    parser = argparse.ArgumentParser()
    parser.add_argument("--lang", required=True, choices=["pl", "en"])
    args = parser.parse_args()

    lang = args.lang
    config = LANG_CONFIG[lang]
    data_dir = DATA_DIR / lang
    output_dir = MODELS_DIR / lang

    print(f"Language: {lang}")
    print(f"Model: {config['model_name']}")

    # Load data
    train_examples = load_jsonl(data_dir / "train.jsonl")
    val_examples = load_jsonl(data_dir / "val.jsonl")

    train_dataset = examples_to_dataset(train_examples)
    _val_dataset = examples_to_dataset(val_examples)
    _val_titles = [ex["expected_title"] for ex in val_examples]

    print(f"Train: {len(train_dataset)}, Val: {len(_val_dataset)}")

    # Compute class weights
    all_labels = []
    for ex in train_examples:
        all_labels.extend(l for l in ex["labels"] if l != -100)
    label_counts = np.bincount(all_labels, minlength=3).astype(float)
    label_counts = np.maximum(label_counts, 1)
    class_weights = label_counts.sum() / (3 * label_counts)
    print(f"Class weights: O={class_weights[0]:.2f}, B={class_weights[1]:.2f}, I={class_weights[2]:.2f}")

    # Load model
    tokenizer = AutoTokenizer.from_pretrained(config["model_name"])
    model = AutoModelForTokenClassification.from_pretrained(
        config["model_name"],
        num_labels=3,
        id2label=ID2LABEL,
        label2id=LABEL2ID,
        torch_dtype=config["torch_dtype"],
    )

    # Freeze lower encoder layers if configured
    freeze_below = config.get("freeze_layers_below")
    if freeze_below is not None:
        # Freeze embeddings
        for param in model.bert.embeddings.parameters():
            param.requires_grad = False
        # Freeze encoder layers below threshold
        for i, layer in enumerate(model.bert.encoder.layer):
            if i < freeze_below:
                for param in layer.parameters():
                    param.requires_grad = False
        trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
        total = sum(p.numel() for p in model.parameters())
        print(f"Frozen layers 0-{freeze_below - 1} + embeddings: {trainable:,} / {total:,} params trainable ({100*trainable/total:.1f}%)")

    # Training args
    training_args = TrainingArguments(
        output_dir=str(output_dir),
        num_train_epochs=config["num_epochs"],
        per_device_train_batch_size=config["batch_size"],
        per_device_eval_batch_size=16,
        gradient_accumulation_steps=2,
        learning_rate=config["learning_rate"],
        weight_decay=0.01,
        warmup_ratio=0.1,
        max_grad_norm=1.0,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="span_accuracy",
        greater_is_better=True,
        save_total_limit=3,
        logging_steps=10,
        fp16=torch.cuda.is_available(),
        report_to="none",
        dataloader_num_workers=0,
        remove_unused_columns=True,
    )

    train_cols = ["input_ids", "attention_mask", "labels"]
    train_ds = train_dataset.select_columns(train_cols)
    val_ds = _val_dataset.select_columns(train_cols)

    callbacks = []
    if len(val_examples) >= 5:
        callbacks.append(EarlyStoppingCallback(early_stopping_patience=5))
    else:
        print(f"Val set too small ({len(val_examples)} examples) — disabling early stopping, training all {config['num_epochs']} epochs")
        training_args.load_best_model_at_end = False

    trainer = WeightedTrainer(
        class_weights=class_weights.tolist(),
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        compute_metrics=lambda p: compute_metrics(p, tokenizer),
        callbacks=callbacks,
    )

    print(f"\nStarting training ({lang})...")
    trainer.train()

    # Save best model
    best_dir = output_dir / "best"
    trainer.save_model(str(best_dir))
    tokenizer.save_pretrained(str(best_dir))
    print(f"\nBest model saved to {best_dir}")

    results = trainer.evaluate()
    print(f"\nFinal validation results ({lang}):")
    for k, v in results.items():
        print(f"  {k}: {v:.4f}" if isinstance(v, float) else f"  {k}: {v}")


if __name__ == "__main__":
    main()

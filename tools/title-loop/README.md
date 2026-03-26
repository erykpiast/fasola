# title-loop

Recipe title extraction — heuristic refinement loop and ML training pipeline.

This directory contains two systems that solve the same problem (extracting a recipe title from noisy OCR text) via different approaches:

1. **Heuristic loop** — iteratively improves a rule-based extractor (`lib/text-classifier/title-extractor.ts`) using Claude Code as an automated evaluator/fixer. 31 iterations, 98.2% accuracy.
2. **ML training pipeline** — trains per-language title extraction models (BIO token classification) and exports them for on-device inference via ExecuTorch.

## Architecture

```
                         example-recipes/*.HEIC
                                  │
                      ┌───────────▼───────────┐
                      │   recognize_rich.py    │  Apple Vision OCR + Claude Haiku
                      │   (title extraction)   │  for title recognition
                      └───────────┬───────────┘
                                  │
                        input/*.real.txt        <- ground truth (filename = title)
                                  │
               ┌──────────────────┼──────────────────┐
               │                                     │
    ┌──────────▼──────────┐             ┌────────────▼────────────┐
    │   HEURISTIC LOOP    │             │    ML TRAINING PIPELINE │
    │                     │             │                         │
    │  title-loop.py      │             │  generate_training_     │
    │    ├ evaluate        │             │    data.py              │
    │    ├ analyze         │             │       │                 │
    │    ├ plan            │             │  prepare_training_      │
    │    ├ execute         │             │    data.py --lang {lang}│
    │    └ commit          │             │       │                 │
    │                     │             │  train_title_model.py   │
    │  eval_only.py       │             │    --lang {lang}        │
    │  extract-title.ts   │             │       │                 │
    │                     │             │  export_to_executorch.py│
    │  Edits:             │             │    --lang {lang}        │
    │  title-extractor.ts │             │       │                 │
    └─────────────────────┘             │  eval_model.py          │
                                        │    --lang {lang}        │
                                        │                         │
                                        │  Output (per language): │
                                        │  models/{lang}/best/    │
                                        │  models/export/{lang}/  │
                                        └─────────────────────────┘

    input/*.generated.txt  <- synthetic + augmented OCR
```

### Per-language models

| Language | Base model | Params | INT8 size |
|---|---|---|---|
| Polish | `dkleczek/bert-base-polish-cased-v1` | 132M | ~132 MB |
| English | `huawei-noah/TinyBERT_General_4L_312D` | 14.4M | ~14 MB |

### Data flow (ML pipeline)

```
1. Photos (example-recipes/)
      | recognize_rich.py (Apple Vision OCR -> Claude Haiku title)
2. OCR text files (input/*.real.txt)
      + synthetic files (input/*.generated.txt)
      + augmented copies of real files (input/*.aug{N}.generated.txt)
      | prepare_training_data.py --lang {pl|en}
3. Per-language tokenized JSONL (data/{lang}/{train,val,test}.jsonl)
      | train_title_model.py --lang {pl|en}
4. Per-language model (models/{lang}/best/)
      | export_to_executorch.py --lang {pl|en}
5. On-device models (models/export/{lang}/*.pte)
```

### On-device integration

The exported `.pte` models are loaded by `lib/text-classifier/title-extractor-model.ts` using `react-native-executorch`. Models are lazy-loaded per language on first request. The heuristic system serves as fallback (see `lib/text-classifier/index.native.ts`).

## Usage

### Prerequisites

```bash
pip3 install --break-system-packages -r tools/title-loop/requirements-ml.txt
```

### Quick start: run the full pipeline overnight

```bash
bash tools/title-loop/run_pipeline.sh
```

Trains both PL and EN models sequentially: data generation -> BIO labeling -> training -> evaluation -> export.

### Step-by-step

#### 1. Generate training data from photos

Place recipe photos in `example-recipes/`, then:

```bash
python3 tools/title-loop/recognize_rich.py
```

Runs Apple Vision OCR on each photo and uses Claude Haiku to extract the title. Output: `input/{TITLE}.real.txt`.

#### 2. Generate synthetic + augmented training data

```bash
python3 tools/title-loop/generate_training_data.py
```

Produces synthetic OCR files across 10 noise patterns plus 5-8 augmented copies of each real file with OCR corruption, line shuffling, and garbage prepend.

#### 3. Prepare per-language BIO-labeled dataset

```bash
python3 tools/title-loop/prepare_training_data.py --lang pl
python3 tools/title-loop/prepare_training_data.py --lang en
```

Detects file language, tokenizes with the language-specific tokenizer, fuzzy-aligns titles to BIO labels. Output: `data/{lang}/{train,val,test}.jsonl`.

#### 4. Train per-language model

```bash
python3 tools/title-loop/train_title_model.py --lang pl
python3 tools/title-loop/train_title_model.py --lang en
```

Direct fine-tuning with weighted cross-entropy and early stopping on span accuracy.

#### 5. Evaluate

```bash
python3 tools/title-loop/eval_model.py --lang pl
python3 tools/title-loop/eval_model.py --lang en
```

#### 6. Test on arbitrary text

```bash
python3 tools/title-loop/predict_title.py --lang pl recipe.txt
echo "CHOCOLATE CAKE..." | python3 tools/title-loop/predict_title.py --lang en
```

#### 7. Export for on-device

```bash
python3 tools/title-loop/export_to_executorch.py --lang pl
python3 tools/title-loop/export_to_executorch.py --lang en
```

### Running the heuristic loop

The original heuristic improvement loop (separate from the ML pipeline):

```bash
python3 tools/title-loop/title-loop.py      # Full loop with Claude
python3 tools/title-loop/eval_only.py        # Quick standalone evaluation
```

## Directory structure

```
tools/title-loop/
├── README.md
├── requirements-ml.txt           # Python deps for ML pipeline
├── run_pipeline.sh               # Overnight training (both languages)
├── lang_detect.py                # Shared language detection
│
├── recognize_rich.py             # Photo OCR -> .real.txt files
├── generate_training_data.py     # Synthetic + augmented .generated.txt
├── generate_ocr_files.py         # Synthetic .generated.txt (heuristic loop)
├── prepare_training_data.py      # BIO labeling -> per-language JSONL
│
├── train_title_model.py          # Per-language model training
├── export_to_executorch.py       # Export to .pte
├── eval_model.py                 # Per-language evaluation
├── predict_title.py              # CLI title prediction
│
├── title-loop.py                 # Heuristic improvement loop
├── eval_only.py                  # Standalone heuristic evaluation
├── extract-title.ts              # CLI wrapper for heuristic extractor
│
├── input/                        # Test corpus (.real.txt + .generated.txt)
├── data/{pl,en}/                 # Per-language BIO-labeled JSONL
├── models/{pl,en}/               # Per-language trained models
├── models/export/{pl,en}/        # ExecuTorch exports
└── docs/                         # Heuristic loop iteration history
```

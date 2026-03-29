# EN Title Model Upgrade: TinyBERT to bert-base-cased

**Status:** Draft
**Authors:** Claude, 2026-03-28

## Overview

Replace the English title extraction model from `huawei-noah/TinyBERT_General_4L_312D` (14.4M params, 4 layers, 312-dim) with `google-bert/bert-base-cased` (110M params, 12 layers, 768-dim) to raise EN title extraction accuracy from ~41% to ~80%+.

## Background / Problem Statement

The English title extraction model performs at **41% span accuracy** — effectively unusable. Users scanning English-language cookbook pages get wrong or missing titles more often than correct ones, actively degrading the experience.

### Failure Mode Analysis

A systematic categorization of 1,029 EN failures reveals a **model capacity problem**, not a data quality or labeling issue:

| Failure Category | EN (TinyBERT 14M) | PL (BERT-base 132M) |
|---|---|---|
| Random fragments (model can't locate title) | **71%** | 32% |
| Grabs body text (ingredients, instructions) | 12% | 0.5% |
| Title + trailing content | 10% | 2% |
| Partial title (boundary error) | 7% | **59%** |
| Empty / noise | 1% | 6% |

The PL model's dominant failure mode is **partial title** (59%) — it finds the title but gets boundaries wrong. That's a healthy, precision-limited failure. The EN model's dominant failure mode is **random fragments** (71%) — it can't even locate titles. TinyBERT lacks the representational capacity for this task.

### Why bert-base-cased

- **Capacity:** 110M params / 12 layers / 768-dim vs. TinyBERT's 14.4M / 4 layers / 312-dim. Same tier as the PL model that achieves 80%.
- **Cased:** Recipe titles in OCR text carry strong casing signals — ALL CAPS headers, Title Case names, lowercase body text. A cased model preserves this discriminative feature. An uncased model discards it.
- **English pretraining:** `bert-base-cased` was pretrained primarily on English text. The PL model (`bert-base-polish-cased-v1`) achieves 80% with a comparable param count and language-matched pretraining — we expect EN to match or exceed that.
- **Tokenizer compatibility:** Same WordPiece vocabulary family as TinyBERT (30,522 tokens). No fundamental tokenization changes.

### Data Availability

| Split | EN | PL |
|---|---|---|
| Train | 1,624 | 2,886 |
| Val | 17 | 43 |
| Test | 18 | 44 |

1,624 EN train samples is ~56% of PL's volume. However, English NER is structurally easier than Polish (less morphological variation, more consistent title casing), and the base model's English pretraining gives it a head start. This volume should be sufficient.

### Secondary Issue: Polish Content in EN Eval Data

~10% of EN eval failures contain Polish text fragments in the model's extraction output (e.g., `"dodaj sol, pieprz"`, `"roztop masło w garnku"`). Investigation shows:

- **Training data is clean** — 0/1,624 EN train samples contain Polish content.
- **Data generators are correct** — language is explicitly tagged from source lists, not inferred.
- The contamination likely comes from the older title-loop synthetic generation (pre-language-suffix migration) or from the `title-loop.py` Claude-based generation which may produce mixed-language content.

Removing contaminated eval samples only moves accuracy from 40% to 43% — the contamination inflates failure count slightly but is not the root cause. Still worth fixing for eval integrity.

## Goals

- Achieve **~80% span accuracy** on EN title extraction (parity with PL)
- Use `google-bert/bert-base-cased` as the EN base model
- Produce an EN `.pte` file of **~130 MB** via INT8 quantization (using existing pipeline)
- Keep total model download budget under **~280 MB** (PL ~150 MB + EN ~130 MB)
- Fix Polish contamination in EN eval data for accurate metrics
- Update size gates, configs, documentation, and CI

## Non-Goals

- Changing the PL model or its configuration
- Modifying the on-device inference code (`title-extractor-model.ts`)
- Changing the ExecuTorch export or quantization pipeline (reuse as-is from spec 020)
- Quantization-aware training (QAT) — only if PTQ accuracy drops beyond threshold
- Reducing `MAX_SEQ_LEN` from 512 (separate optimization)
- Expanding the EN training dataset (try model swap first, augment later if needed)
- Changing the BIO label scheme or matching logic

## Technical Dependencies

- **PyTorch 2.x** — `torch.export`, training
- **transformers** — `AutoModelForTokenClassification`, `AutoTokenizer` for `google-bert/bert-base-cased`
- **torchao** — INT8 weight-only quantization (already in `requirements-ml.txt`)
- **ExecuTorch** — XNNPACK backend, edge IR (existing pipeline)
- **HuggingFace Hub** — model download, .pte upload to `erykpiast/fasola-title-extractor-en`

No new dependencies required — the existing `requirements-ml.txt` covers everything.

## Detailed Design

### 1. Model Configuration Changes

Two files contain the EN model config:

**`tools/title-loop/train_title_model.py`** (LANG_CONFIG):
```python
"en": {
    "model_name": "google-bert/bert-base-cased",
    "learning_rate": 2e-5,     # reduced from 3e-5 for larger model
    "num_epochs": 15,          # reduced from 30 — larger model converges faster
    "batch_size": 8,           # keep at 8 (gradient_accumulation_steps=2 gives effective 16)
    "torch_dtype": torch.float32,
}
```

Hyperparameter rationale:
- **Learning rate 2e-5:** Standard for fine-tuning BERT-base on NER tasks. TinyBERT used 3e-5 because smaller models tolerate higher rates. 2e-5 is the value used in the original BERT paper for NER.
- **Epochs 15:** BERT-base on small NER datasets typically converges in 5-15 epochs. 30 was needed for TinyBERT's limited capacity. With `load_best_model_at_end=True` and `metric_for_best_model="span_accuracy"`, early stopping effectively applies.

**`tools/title-loop/prepare_training_data.py`** (LANG_CONFIG):
```python
"en": {"model_name": "google-bert/bert-base-cased"},
```

### 2. Size Gate Updates

**`tools/title-loop/export_to_executorch.py`:**
```python
MAX_SIZE_MB = {"pl": 150, "en": 150}  # was: {"pl": 150, "en": 20}
```

bert-base-cased has 110M params. With INT8 quantization:
- Embedding table: 30,522 x 768 = ~23M params → ~23 MB INT8
- 12 transformer layers: ~85M params → ~85 MB INT8
- Overhead (scales, layer norms, serialization): ~10-15 MB
- **Expected total: ~120-130 MB**

Setting the gate at 150 MB gives headroom while still catching regressions.

**`.github/workflows/export-title-models.yml`:**
```yaml
# Update size gate — both languages now use bert-base class models
MAX_SIZE_MB=150
# Remove the EN-specific override:
# if [ "${{ matrix.lang }}" = "en" ]; then
#   MAX_SIZE_MB=20
# fi
```

### 3. Polish Contamination Fix in Eval Data

The eval runs on files in `tools/title-loop/input/`. Generated files are created by multiple scripts, all of which now correctly tag language in filenames. The contamination likely exists in previously-generated files that persist on disk.

**Fix:** Regenerate all EN synthetic data before eval:
```bash
# Delete old EN generated files
rm tools/title-loop/input/*.en.generated.txt
# Regenerate
python3 tools/title-loop/generate_training_data.py
```

Additionally, add a validation step in `prepare_training_data.py` or `eval_model.py` that warns if an EN file contains Polish diacritics:

```python
POLISH_CHARS = set("ąęśćźżłóńĄĘŚĆŹŻŁÓŃ")

def warn_language_mismatch(file_path: Path, lang: str):
    """Warn if file content doesn't match expected language."""
    if lang == "en":
        text = file_path.read_text(encoding="utf-8")
        pl_count = sum(1 for c in text if c in POLISH_CHARS)
        if pl_count >= 5:
            print(f"  WARNING: {file_path.name} contains {pl_count} Polish characters")
```

### 4. App-Side Cosmetic Update

`lib/text-classifier/title-extractor-model.ts` line 39 has a cosmetic `name` field set to `"TinyBERT_General_4L_312D"` (used only in logging). Update to `"bert-base-cased"` for consistency. No functional changes — the download URLs point to the HuggingFace repo which will serve the new .pte file at the same path.

### 5. Documentation Updates

**`tools/title-loop/README.md`** — update the model table:

| Language | Base model | Params | INT8 size |
|---|---|---|---|
| Polish | `dkleczek/bert-base-polish-cased-v1` | 132M | ~150 MB |
| English | `google-bert/bert-base-cased` | 110M | ~130 MB |

### 6. Retraining and Export Pipeline

No changes needed to the training or export scripts beyond config values. The pipeline is model-agnostic:

```
prepare_training_data.py --lang en  (uses new tokenizer)
→ data/en/{train,val,test}.jsonl    (re-tokenized with bert-base-cased)
→ train_title_model.py --lang en    (trains with new config)
→ models/en/best/                   (new checkpoint)
→ export_to_executorch.py --lang en (same quantization pipeline)
→ models/export/en/title_extractor_xnnpack.pte (~130 MB)
```

Or via the pipeline script:
```bash
bash tools/title-loop/run_pipeline.sh --lang en
```

### 7. HuggingFace Model Repository

The CI workflow uploads to `erykpiast/fasola-title-extractor-en`. The new .pte will replace the old one at the same path (`title_extractor_xnnpack.pte`). The tokenizer files will also be updated (bert-base-cased tokenizer replaces TinyBERT tokenizer).

The app-side code downloads from this fixed URL — no app changes needed.

## User Experience

No user-facing changes to the app. Users will experience:

- **Dramatically better EN title extraction:** ~80% vs. ~41% accuracy
- **Larger initial model download:** ~130 MB vs. ~14 MB (one-time, lazy download)
- **Comparable inference latency:** INT8 XNNPACK on bert-base is slower than TinyBERT due to 3x more layers, but both complete in < 1s per page on modern iPhones
- **Same accuracy for PL:** No changes to PL model

## Testing Strategy

### Accuracy Validation (Critical)

1. **Pre-upgrade baseline:** Record current TinyBERT metrics on EN test set
   - Token-level F1 score
   - Span-level accuracy (exact title match)
   - Per-category failure breakdown (using the categorization from the failure analysis)

2. **Post-upgrade comparison:** Run same test set through bert-base-cased model
   - **Acceptance threshold:** span_accuracy >= 75% on real files (currently 41%)
   - **Stretch goal:** span_accuracy >= 80% (parity with PL)
   - Verify "random fragment" failures drop from 71% to < 30%

3. **Regression tests:**
   - Titles that TinyBERT got right must still be correct (no regressions on easy cases)
   - Hyphenated titles (`Eastern-Style Focaccia`) should improve with casing info

### Size Verification

- Export script prints size and warns if > 150 MB
- CI size gate enforces 150 MB limit
- Verify .pte file loads successfully in ExecuTorch runtime

### On-Device Integration

- Load new .pte in the app via `react-native-executorch`
- Verify inference produces valid BIO label sequences
- Compare extracted titles against known inputs
- Check inference latency is acceptable (< 1s per page)

### Data Quality Validation

- After regenerating EN synthetic data, verify 0 files contain Polish diacritics
- Run `eval_model.py --lang en` and confirm no Polish text in extraction outputs

## Performance Considerations

| Metric | TinyBERT (current) | bert-base-cased (new) |
|---|---|---|
| Model size (INT8 .pte) | ~14 MB | ~130 MB |
| Download time (LTE) | ~2s | ~20s |
| Inference time (iPhone 15) | ~100ms | ~300ms (est.) |
| Memory at inference | ~20 MB | ~150 MB |
| Accuracy | 41% | ~80% (est.) |

The 10x size increase is justified by the 2x accuracy improvement. The model downloads lazily and is cached permanently. Inference remains sub-second, well within acceptable limits for background processing.

## Security Considerations

No security impact. The model is a standard BERT checkpoint from HuggingFace, quantized and exported through the same pipeline as the PL model.

## Documentation

- Update `tools/title-loop/README.md` model table
- Update inline comments in `train_title_model.py` if any reference TinyBERT
- No user-facing documentation needed (transparent change)

## Implementation Phases

### Phase 1: Model Swap and Retrain

- Update `model_name` in `train_title_model.py` and `prepare_training_data.py`
- Adjust hyperparameters (learning_rate, num_epochs)
- Regenerate EN training data with new tokenizer: `prepare_training_data.py --lang en`
- Train: `train_title_model.py --lang en`
- Evaluate: `eval_model.py --lang en` — verify accuracy >= 75%

### Phase 2: Export and CI

- Update `MAX_SIZE_MB["en"]` to 150 in `export_to_executorch.py`
- Update CI workflow size gate
- Export: `export_to_executorch.py --lang en` — verify .pte size
- Upload to HuggingFace via CI or manually

### Phase 3: Data Quality

- Regenerate EN synthetic files to eliminate Polish contamination
- Add language mismatch warning to eval pipeline
- Re-run evaluation on clean data for accurate baseline metrics
- Update README

### Phase 4: On-Device Validation

- Download new .pte in the app
- Run title extraction on test corpus
- Verify accuracy and latency are acceptable
- If accuracy < 75%: consider increasing training data or adjusting hyperparameters

## Open Questions

1. **Inference latency on older devices:** bert-base-cased has 3x the layers of TinyBERT. On iPhone 12 or older, inference may approach 500ms+. Is this acceptable for background processing? (Likely yes — processing happens asynchronously.)

2. **Training data sufficiency:** 1,624 EN samples should be enough for bert-base with English pretraining, but if accuracy plateaus below 75%, options include:
   - Generate more synthetic data (the pipeline supports this)
   - Use the existing PL data generation patterns adapted for EN
   - Augment real EN files more aggressively

3. **bert-base-cased vs. bert-base-uncased:** This spec recommends cased based on the title casing signal argument. If cased underperforms expectations, uncased is a quick fallback to test (same size, same pipeline).

4. **Epoch count tuning:** Starting at 15 epochs is a best guess. Monitor validation loss curves — if the model converges by epoch 8, reduce for faster iteration. If it's still improving at 15, increase to 20.

## References

- [google-bert/bert-base-cased on HuggingFace](https://huggingface.co/google-bert/bert-base-cased)
- [BERT: Pre-training of Deep Bidirectional Transformers](https://arxiv.org/abs/1810.04805) — original BERT paper, recommends 2e-5 LR for NER
- [Spec 020: PL Model INT8 Quantization](../020_pl_model_quantization/feat-pl-model-int8-quantization.md) — quantization pipeline this spec reuses
- Current EN eval results: `tools/title-loop/models/en/eval_results_en.json`
- Training config: `tools/title-loop/train_title_model.py` lines 44-50
- Export config: `tools/title-loop/export_to_executorch.py` line 45
- CI workflow: `.github/workflows/export-title-models.yml` lines 116-127
- HuggingFace repo: `erykpiast/fasola-title-extractor-en`

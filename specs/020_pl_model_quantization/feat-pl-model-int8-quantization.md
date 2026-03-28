# PL Title Model INT8 Quantization + XNNPACK Delegation

**Status:** Draft
**Authors:** Claude, 2026-03-27

## Overview

Reduce the Polish title recognition model (`dkleczek/bert-base-polish-cased-v1`, 132M params) from ~502 MB (float32) to ~150 MB via INT8 post-training quantization (PTQ) with XNNPACK delegation, enabling practical on-device inference.

The English model (`TinyBERT_General_4L_312D`, 14.4M params, ~54 MB float32) should also benefit from INT8 quantization (~15 MB) for consistency and performance.

## Background / Problem Statement

The current export pipeline in `tools/title-loop/export_to_executorch.py` converts trained PyTorch models to ExecuTorch `.pte` format with XNNPACK delegation, but operates entirely in float32. For the PL model:

- **Float32 safetensors:** 502 MB
- **Float32 .pte (with XNNPACK):** ~500 MB (delegation partitions the graph but doesn't reduce precision)
- **Target INT8 .pte:** ~150 MB (INT8 linear layers + INT8 embedding weights)

The 500 MB model is impractical for mobile distribution:
1. Excessive download size on cellular networks
2. Unacceptable storage footprint for a single feature
3. Slow initial load time into memory
4. The app-side code (`lib/text-classifier/title-extractor-model.ts`) already downloads models lazily from HuggingFace, but even lazy loading doesn't fix the fundamental size problem

### Why the PL model is so much bigger

The PL model uses `bert-base-polish-cased-v1` with:
- Vocabulary size: ~60,000 tokens (vs. TinyBERT's ~30,522)
- 12 transformer layers (vs. TinyBERT's 4)
- 768 hidden dimension (vs. TinyBERT's 312)
- Embedding table alone: 60,000 x 768 x 4 bytes = ~175 MB in float32

### Realistic size expectations

INT8 quantization provides a theoretical 4x reduction (~132 MB floor), but overhead from scale/zero-point tensors, layer norms staying in float32, and serialization pushes the realistic target higher:

| Scenario | Estimated PL Size |
|---|---|
| Linears INT8, embeddings float32 | ~180-220 MB |
| Linears INT8 + embeddings INT8 (via torchao) | ~145-165 MB |
| Theoretical floor (all params INT8, no overhead) | ~132 MB |

**Target: ~150 MB** — a 3.3x reduction from 502 MB, achievable with INT8 linear layers (via XNNPACK PT2E) + INT8 embedding weights (via torchao weight-only quantization).

## Goals

- Produce a PL `.pte` file of **~150 MB** via INT8 quantization
- Maintain title extraction accuracy within **2% span_accuracy** of the float32 baseline
- Keep XNNPACK delegation for accelerated inference on CPU
- Update the export script, CI workflow, and verification steps
- Apply the same quantization pipeline to the EN model for consistency
- Document the quantization approach for reproducibility

## Non-Goals

- Changing the base model architecture (no distillation, no model swap)
- Quantization-aware training (QAT) — explore only if PTQ accuracy drops beyond threshold
- INT4 or mixed-precision quantization (future optimization)
- Changes to the on-device inference code in `title-extractor-model.ts` (the ExecuTorch runtime handles quantized models transparently)
- Changes to the training pipeline (`train_title_model.py`)
- Reducing `MAX_SEQ_LEN` from 512 (separate optimization)

## Technical Dependencies

- **ExecuTorch** (latest stable or nightly) — XNNPACK backend, edge IR
  - `executorch.backends.xnnpack.quantizer.xnnpack_quantizer.XNNPACKQuantizer` — INT8 quantization for linear layers
  - `executorch.backends.xnnpack.partition.xnnpack_partitioner.XnnpackPartitioner` — XNNPACK delegation
  - `executorch.exir.to_edge_transform_and_lower` — combined edge lowering
- **torchao** — weight-only INT8 quantization for embedding tables (XNNPACK does not support embedding ops)
  - `torchao.quantization.quant_api.quantize_`, `IntxWeightOnlyConfig`
  - `torchao.quantization.granularity.PerAxis`
  - `torchao.quantization.pt2e.quantize_pt2e.prepare_pt2e`, `convert_pt2e`
  - `torchao.quantization.pt2e.move_exported_model_to_eval`
- **PyTorch 2.x** — `torch.export`
- **transformers** — model loading (`AutoModelForTokenClassification`)
- **react-native-executorch** v0.6.0 — on-device runtime (no changes expected; INT8 inference is handled by XNNPACK backend)

### Key reference: ExecuTorch PT2E Quantization Flow

```
PyTorch model
  → quantize_(model, IntxWeightOnlyConfig, embedding filter)  # INT8 embeddings (pre-export)
  → torch.export.export()
  → exported.module()                                          # REQUIRED before prepare_pt2e
  → prepare_pt2e(module, XNNPACKQuantizer)                     # insert observers for linears
  → calibrate with representative data
  → convert_pt2e()                                             # replace observers with quantized ops
  → torch.export.export(quantized_model)                       # re-export after quantization
  → to_edge_transform_and_lower(partitioner=XnnpackPartitioner)
  → to_executorch()
  → .pte file
```

### Known issues to watch for

- **ExecuTorch #11355:** LayoutLMV3 (BERT-family) runtime failure with XNNPACK quantization from denormalized scale values. Root cause: insufficient calibration causing zero-activation channels. Mitigation: use diverse calibration data covering all attention patterns.
- **PyTorch #127076:** `prepare_pt2e` dtype inconsistency with integer primitive inputs (relevant for token IDs). May require explicit dtype handling.
- **PyTorch #128114:** Import `XNNPACKQuantizer` from `executorch.backends.xnnpack.quantizer.xnnpack_quantizer`, NOT from `torch.ao.quantization.quantizer` (ImportError in PyTorch 2.3.1+).

## Detailed Design

### 1. Two-Stage Quantization Strategy

XNNPACK's supported quantized ops are: **linear, convolution, add, mul, cat, adaptive avg pool 2d**. Notably, `nn.Embedding` is **not supported** — the quantizer silently skips embedding nodes, leaving them in float32. This means we need a two-stage approach:

**Stage A — Embedding weights (pre-export):** Use `torchao` weight-only INT8 quantization on `nn.Embedding` layers before `torch.export`. This is the approach used by ExecuTorch's own LLM pipelines (e.g., Qwen3-4B).

**Stage B — Linear layers (PT2E flow):** Use `XNNPACKQuantizer` with `prepare_pt2e` / `convert_pt2e` for attention projections and feed-forward networks, with calibration data.

#### Stage A: Embedding Quantization

```python
from torchao.quantization.quant_api import IntxWeightOnlyConfig, quantize_
from torchao.quantization.granularity import PerAxis

# INT8 weight-only quantization for embedding tables
quantize_(
    wrapper,
    IntxWeightOnlyConfig(weight_dtype=torch.int8, granularity=PerAxis(0)),
    filter_fn=lambda m, fqn: isinstance(m, torch.nn.Embedding),
)
```

This reduces the embedding table from ~175 MB to ~44 MB (4x reduction) while keeping dequantization at lookup time.

#### Stage B: Linear Layer Quantization (PT2E)

```python
from executorch.backends.xnnpack.quantizer.xnnpack_quantizer import (
    XNNPACKQuantizer,
    get_symmetric_quantization_config,
)
from torchao.quantization.pt2e.quantize_pt2e import prepare_pt2e, convert_pt2e

quantizer = XNNPACKQuantizer()
quantizer.set_global(get_symmetric_quantization_config())

# Export first, then extract module for PT2E
exported = torch.export.export(wrapper, (example_input_ids, example_attention_mask))
exported_module = exported.module()  # REQUIRED — prepare_pt2e needs nn.Module, not ExportedProgram

prepared = prepare_pt2e(exported_module, quantizer)

# Calibrate
with torch.no_grad():
    for input_ids, attention_mask in calibration_data:
        prepared(input_ids, attention_mask)

quantized = convert_pt2e(prepared)

# Must re-export after quantization before lowering
final_exported = torch.export.export(quantized, (example_input_ids, example_attention_mask))
```

### 2. Calibration Dataset

PT2E static quantization requires representative input data to determine quantization ranges (min/max values per tensor).

**Current data availability:**
- PL: 24 val samples, 25 test samples, 1,795 train samples
- EN: 6 val samples

**Strategy:** Use all val samples + randomly sample from train to reach **256 calibration samples**. 256 is the sweet spot for BERT-class models — enough to cover diverse attention patterns and avoid the zero-activation scale=0 failure (ExecuTorch #11355), without adding significant export time.

```python
import random

def get_calibration_data(tokenizer, lang, num_samples=256):
    """Load representative samples for quantization calibration.

    Draws from val first, then supplements from train to reach num_samples.
    Diversity matters more than quantity — insufficient calibration can cause
    runtime failures from denormalized scale values (ExecuTorch #11355).
    """
    samples = []

    # Load all val samples first
    val_path = DATA_DIR / lang / "val.jsonl"
    train_path = DATA_DIR / lang / "train.jsonl"

    val_texts = []
    if val_path.exists():
        with open(val_path) as f:
            val_texts = [json.loads(line)["text"] for line in f]

    train_texts = []
    if train_path.exists():
        with open(train_path) as f:
            train_texts = [json.loads(line)["text"] for line in f]

    # Combine: all val + random sample from train
    all_texts = val_texts
    remaining = num_samples - len(all_texts)
    if remaining > 0 and train_texts:
        random.seed(42)  # reproducible calibration
        all_texts += random.sample(train_texts, min(remaining, len(train_texts)))

    for text in all_texts[:num_samples]:
        enc = tokenizer(
            text,
            max_length=MAX_SEQ_LEN,
            padding="max_length",
            truncation=True,
            return_tensors="pt",
        )
        samples.append((
            enc["input_ids"].to(torch.int),
            enc["attention_mask"].to(torch.int),
        ))

    print(f"  Loaded {len(samples)} calibration samples ({len(val_texts)} val + {len(samples) - len(val_texts)} train)")
    return samples
```

### 3. Updated Export Script

The main changes to `export_to_executorch.py`:

```python
def export_to_pte(model_path: Path, output_dir: Path, lang: str, quantize: bool = True):
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading model from {model_path}")
    model = AutoModelForTokenClassification.from_pretrained(model_path)
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    model.eval()

    wrapper = TitleExtractorWrapper(model)
    wrapper.eval()

    if quantize:
        # Stage A: INT8 embedding weights (pre-export, via torchao)
        print("Stage A: Quantizing embedding weights to INT8...")
        from torchao.quantization.quant_api import IntxWeightOnlyConfig, quantize_
        from torchao.quantization.granularity import PerAxis

        quantize_(
            wrapper,
            IntxWeightOnlyConfig(weight_dtype=torch.int8, granularity=PerAxis(0)),
            filter_fn=lambda m, fqn: isinstance(m, torch.nn.Embedding),
        )
        print("  Embedding weights quantized")

    example_input_ids = torch.ones(1, MAX_SEQ_LEN, dtype=torch.int)
    example_attention_mask = torch.ones(1, MAX_SEQ_LEN, dtype=torch.int)

    # Step 1: torch.export
    print("Step 1: torch.export...")
    exported = torch.export.export(
        wrapper,
        (example_input_ids, example_attention_mask),
    )

    if quantize:
        # Stage B: INT8 linear layers (PT2E flow)
        print("Stage B: PT2E quantization of linear layers...")
        from executorch.backends.xnnpack.quantizer.xnnpack_quantizer import (
            XNNPACKQuantizer,
            get_symmetric_quantization_config,
        )
        from torchao.quantization.pt2e.quantize_pt2e import prepare_pt2e, convert_pt2e

        quantizer = XNNPACKQuantizer()
        quantizer.set_global(get_symmetric_quantization_config())

        exported_module = exported.module()
        prepared = prepare_pt2e(exported_module, quantizer)

        # Calibrate with representative data
        calibration_data = get_calibration_data(tokenizer, lang, num_samples=256)
        print(f"  Calibrating with {len(calibration_data)} samples...")
        with torch.no_grad():
            for input_ids, attention_mask in calibration_data:
                prepared(input_ids, attention_mask)

        quantized = convert_pt2e(prepared)

        # Re-export after quantization
        print("  Re-exporting quantized model...")
        exported = torch.export.export(
            quantized,
            (example_input_ids, example_attention_mask),
        )

    # Step 2: Edge IR + XNNPACK lowering
    print("Step 2: Edge transform and XNNPACK lowering...")
    from executorch.exir import to_edge_transform_and_lower
    from executorch.backends.xnnpack.partition.xnnpack_partitioner import XnnpackPartitioner

    et_program = to_edge_transform_and_lower(
        exported,
        partitioner=[XnnpackPartitioner()],
    ).to_executorch()

    # Step 3: Save .pte
    pte_path = output_dir / "title_extractor_xnnpack.pte"
    with open(pte_path, "wb") as f:
        f.write(et_program.buffer)

    size_mb = pte_path.stat().st_size / 1024 / 1024
    print(f"Saved: {pte_path} ({size_mb:.1f} MB)")

    # Size gate
    max_size = {"pl": 150, "en": 20}
    if size_mb > max_size.get(lang, 150):
        print(f"WARNING: Model is {size_mb:.1f} MB, exceeds {max_size[lang]} MB target")

    # Copy tokenizer files (unchanged from current script)
    ...
```

#### CLI Arguments

Add `--no-quantize` flag for debugging/comparison:

```python
parser.add_argument("--no-quantize", action="store_true",
                    help="Skip INT8 quantization (for baseline comparison)")
```

### 4. Accuracy Validation

Accuracy validation is a **manual on-device step** after export, not automated in the export script. The process:

1. Record float32 baseline metrics from `models/{lang}/eval_results_{lang}.json` (produced by `eval_model.py`)
2. Export quantized `.pte`
3. Load in the app via `react-native-executorch`, run title extraction on the test corpus
4. Compare span_accuracy: must be within 2% of baseline

The export script logs the baseline metrics path and size gate result to aid manual verification.

### 5. CI Workflow Updates

Update `.github/workflows/export-title-models.yml`:

```yaml
- name: Install dependencies
  run: |
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
    pip install transformers safetensors torchao
    pip install executorch || echo "WARNING: executorch install failed, will retry with nightly"
    if ! python -c "from executorch.exir import to_edge_transform_and_lower" 2>/dev/null; then
      pip install --pre executorch -f https://ossci-linux.s3.amazonaws.com/executorch-nightly/
    fi

- name: Export to ExecuTorch .pte (INT8 quantized)
  if: steps.check.outputs.exists == 'true'
  run: |
    python3 tools/title-loop/export_to_executorch.py --lang ${{ matrix.lang }}

- name: Verify export size
  if: steps.check.outputs.exists == 'true'
  run: |
    PTE="tools/title-loop/models/export/${{ matrix.lang }}/title_extractor_xnnpack.pte"
    if [ -f "$PTE" ]; then
      SIZE_BYTES=$(stat -c%s "$PTE" 2>/dev/null || stat -f%z "$PTE")
      SIZE_MB=$((SIZE_BYTES / 1024 / 1024))
      echo "Model size: ${SIZE_MB} MB"

      MAX_SIZE_MB=150
      if [ "${{ matrix.lang }}" = "en" ]; then
        MAX_SIZE_MB=20
      fi

      if [ "$SIZE_MB" -gt "$MAX_SIZE_MB" ]; then
        echo "::error::Model too large: ${SIZE_MB} MB > ${MAX_SIZE_MB} MB limit"
        exit 1
      fi
    else
      echo "::error::.pte file not created"
      exit 1
    fi
```

### 6. File Changes Summary

| File | Change |
|------|--------|
| `tools/title-loop/export_to_executorch.py` | Two-stage quantization (torchao embeddings + PT2E linears), calibration from val+train, `--no-quantize` flag, size gate |
| `.github/workflows/export-title-models.yml` | Add `torchao` to deps, size gate step (150 MB PL / 20 MB EN) |
| `tools/title-loop/requirements-ml.txt` | Add `torchao` |

### Architecture: No Changes to On-Device Code

The ExecuTorch runtime (`react-native-executorch`) handles INT8 quantized models transparently — the XNNPACK backend recognizes quantized ops and dispatches them to optimized INT8 kernels. The app-side code in `lib/text-classifier/title-extractor-model.ts` requires **no changes**:

```typescript
// This code works identically for float32 and INT8 .pte files
const execModule = new ExecutorchModule();
await execModule.load(urls.model);  // same API, quantized model
```

The model URL on HuggingFace stays the same (`title_extractor_xnnpack.pte`) — the file is simply replaced with the quantized version.

## User Experience

No user-facing changes. The model is downloaded and cached transparently. Users will experience:
- **Faster initial download:** ~150 MB vs ~500 MB (3.3x smaller)
- **Less storage used:** same reduction
- **Comparable or faster inference:** XNNPACK INT8 kernels are typically 1.5-2x faster than float32 on ARM CPUs
- **Same accuracy:** within 2% span_accuracy of float32

## Testing Strategy

### Accuracy Validation (Critical)

1. **Pre-quantization baseline:** Record float32 model metrics on `data/pl/test.jsonl`
   - Token-level F1 score
   - Span-level accuracy (exact title match)
2. **Post-quantization comparison:** Run same test set through quantized model on-device
   - Acceptance threshold: span_accuracy drop < 2%
3. **Edge cases to test:**
   - Very short inputs (1-2 words)
   - Maximum length inputs (512 tokens)
   - Inputs with no title present
   - Inputs with multiple titles

Purpose: Ensure quantization doesn't disproportionately hurt specific input types.

### Size Verification

- CI size gate: PL model <= 150 MB, EN model <= 20 MB
- Export script prints size and warns if exceeded

### On-Device Integration

- Load quantized `.pte` in the app via `react-native-executorch`
- Verify inference produces valid BIO label sequences
- Compare extracted titles against known inputs

Purpose: Confirm the quantized model works end-to-end through the ExecuTorch runtime on iOS.

### Regression Prevention

- Store baseline accuracy metrics in `models/{lang}/eval_results_{lang}.json`
- CI can compare against baseline after re-export (future enhancement)

## Performance Considerations

- **Model size:** 502 MB -> ~150 MB (PL), 54 MB -> ~15 MB (EN)
- **Download time:** ~3.3x faster on typical mobile connection
- **Inference speed:** INT8 XNNPACK is typically 1.5-2x faster than float32 on ARM
- **Memory usage:** Proportional reduction in runtime memory
- **Calibration cost:** One-time 256-sample pass during export (adds seconds to CI, not minutes)

## Security Considerations

No security impact. Quantization is a model compression technique that doesn't change the model's input/output interface or data handling.

## Documentation

- Update `tools/title-loop/README.md` (if it exists) with quantization notes
- Add inline comments in export script explaining the two-stage quantization flow
- No user-facing documentation needed (transparent change)

## Implementation Phases

### Phase 1: Core Quantization

- Add two-stage quantization to `export_to_executorch.py` (torchao embeddings + PT2E linears)
- Add calibration data loading from val + train splits (256 samples)
- Add `--no-quantize` flag for baseline comparison
- Add `torchao` to `requirements-ml.txt`
- Test locally: export both PL and EN models, verify size

### Phase 2: CI Integration

- Update GitHub Actions workflow with `torchao` dep and size gate
- Ensure ExecuTorch + torchao install correctly in CI
- Run export for both languages, verify uploads to HuggingFace

### Phase 3: On-Device Validation

- Load quantized models on-device via the app
- Run title extraction on test corpus, compare results against float32 baseline
- If accuracy drop > 2%: increase calibration samples to 500, try per-layer sensitivity analysis

## Open Questions

1. **Embedding quantization accuracy impact:** INT8 embedding tables may lose nuance for morphologically rich Polish text. If span_accuracy drops significantly, FP16 embeddings are a fallback (would increase model to ~180-200 MB).

2. **react-native-executorch INT8 support:** Verify that v0.6.0 of the library correctly dispatches INT8 XNNPACK ops. This should work by design (ExecuTorch handles it at the runtime level), but needs on-device verification.

3. **torchao + ExecuTorch version compatibility:** Both libraries are evolving rapidly. The import paths and API may shift between releases. Pin versions in `requirements-ml.txt` after confirming a working combination.

## References

- [ExecuTorch Quantization Overview](https://docs.pytorch.org/executorch/stable/quantization-overview.html)
- [XNNPACK Quantization Reference](https://docs.pytorch.org/executorch/1.0/backends/xnnpack/xnnpack-quantization.html)
- [PT2E Quantization Tutorial](https://docs.pytorch.org/tutorials/prototype/pt2e_quant_ptq.html)
- [ExecuTorch XNNPACK Delegate Lowering](https://docs.pytorch.org/executorch/stable/tutorial-xnnpack-delegate-lowering.html)
- [ExecuTorch #11355 — BERT-family XNNPACK runtime failure](https://github.com/pytorch/executorch/issues/11355)
- [PyTorch #127076 — prepare_pt2e dtype inconsistency](https://github.com/pytorch/pytorch/issues/127076)
- [PyTorch #128114 — XNNPACKQuantizer import path](https://github.com/pytorch/pytorch/issues/128114)
- Current export script: `tools/title-loop/export_to_executorch.py`
- Training script: `tools/title-loop/train_title_model.py`
- On-device inference: `lib/text-classifier/title-extractor-model.ts`
- CI workflow: `.github/workflows/export-title-models.yml`
- HuggingFace repos: `erykpiast/fasola-title-extractor-{pl,en}`

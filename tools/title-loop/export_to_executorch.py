#!/usr/bin/env python3
"""
Export a per-language model to ExecuTorch .pte format with XNNPACK backend.

Usage:
    python3 tools/title-loop/export_to_executorch.py --lang pl
    python3 tools/title-loop/export_to_executorch.py --lang en
    python3 tools/title-loop/export_to_executorch.py --lang pl --no-quantize
    python3 tools/title-loop/export_to_executorch.py --lang pl --model-path /path/to/checkpoint

Pipeline (quantized):
    PyTorch model
      → torchao int8_weight_only on nn.Linear layers (Stage B)
      → QuantizedEmbedding INT8 row-wise on nn.Embedding tables (Stage A)
      → torch.export
      → to_edge_transform_and_lower with XnnpackPartitioner
      → .pte file

Both stages use weight-only quantization (no calibration data required).
Stage B uses torchao; Stage A uses a custom QuantizedEmbedding that stores
INT8 weights and dequantizes via standard aten ops at runtime (aten.to.dtype
+ aten.mul + aten.embedding). torchao approaches for embeddings were tried but
failed — see quantize_embeddings() docstring for details.

Pipeline (unquantized):
    PyTorch model → torch.export → to_edge_transform_and_lower → .pte file

Reads:  tools/title-loop/models/{lang}/best/
Writes: tools/title-loop/models/export/{lang}/title_extractor_xnnpack.pte
"""

import argparse
import shutil
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
from transformers import AutoModelForTokenClassification, AutoTokenizer

MODELS_DIR = Path(__file__).parent / "models"
MAX_SEQ_LEN = 512

# Size gates per language (MB)
MAX_SIZE_MB = {"pl": 150, "en": 20}


class QuantizedEmbedding(nn.Module):
    """INT8 row-wise quantized embedding using only standard aten ops.

    Replaces nn.Embedding for .pte file size reduction. The INT8 weights are
    stored in the .pte file and dequantized to float32 at inference time before
    the embedding lookup. This halves the .pte size for large vocab tables.

    Uses standard aten ops (aten.to.dtype, aten.mul, aten.embedding) that are
    supported by ExecuTorch's runtime, unlike torchao::dequantize_affine which
    lacks an ExecuTorch out-variant.
    """

    def __init__(self, num_embeddings: int, embedding_dim: int, padding_idx=None):
        super().__init__()
        self.padding_idx = padding_idx
        self.weight_q = nn.Parameter(
            torch.zeros(num_embeddings, embedding_dim, dtype=torch.int8),
            requires_grad=False,
        )
        self.scales = nn.Parameter(
            torch.ones(num_embeddings, dtype=torch.float32),
            requires_grad=False,
        )

    @classmethod
    def from_embedding(cls, emb: nn.Embedding) -> "QuantizedEmbedding":
        w = emb.weight.data.float()
        scales = w.abs().max(dim=1).values / 127.0
        scales = scales.clamp(min=1e-8)
        w_q = (w / scales.unsqueeze(1)).round().clamp(-128, 127).to(torch.int8)
        q = cls(emb.num_embeddings, emb.embedding_dim, emb.padding_idx)
        q.weight_q.data.copy_(w_q)
        q.scales.data.copy_(scales)
        return q

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        w = self.weight_q.float() * self.scales.unsqueeze(1)
        return F.embedding(x, w, padding_idx=self.padding_idx)


class TitleExtractorWrapper(torch.nn.Module):
    """Wrapper that takes input_ids and attention_mask, returns logits."""

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
        outputs = self.model(input_ids=input_ids, attention_mask=attention_mask)
        return outputs.logits


def quantize_embeddings(root: nn.Module) -> None:
    """Stage A: INT8 row-wise quantization on embedding tables.

    Replaces each nn.Embedding child with QuantizedEmbedding which stores INT8
    weights and dequantizes via standard aten ops at runtime. This halves the
    .pte file size for the large word embedding table (~60k × 768).

    torchao approaches were tried but failed:
    - int8_weight_only: silently skips nn.Embedding (only works for nn.Linear)
    - IntxWeightOnlyConfig: produces torchao::dequantize_affine which has no
      ExecuTorch out-variant (Missing out variants error at to_executorch())
    """
    for name, module in list(root.named_modules()):
        if not isinstance(module, nn.Embedding):
            continue
        # Split the qualified name to find parent and attribute
        parts = name.split(".")
        parent = root
        for part in parts[:-1]:
            parent = getattr(parent, part)
        setattr(parent, parts[-1], QuantizedEmbedding.from_embedding(module))


def quantize_linears(wrapper):
    """Stage B: INT8 weight-only quantization on linear layers via torchao.

    Uses int8_weight_only which produces standard aten ops (aten.to, aten.mm,
    aten.mul) that ExecuTorch can lower. IntxWeightOnlyConfig was tried but
    produces torchao::dequantize_affine which has no ExecuTorch out-variant.

    PT2E static quantization (XNNPACKQuantizer) was also tried but causes
    IndexError during calibration: set_global annotates position-ID tensors
    that feed into aten.index as indices, converting them to float via
    fake-quantize nodes, breaking the index operation.
    """
    from torchao.quantization.quant_api import int8_weight_only, quantize_

    quantize_(
        wrapper,
        int8_weight_only(),
        filter_fn=lambda m, fqn: isinstance(m, torch.nn.Linear),
    )


def export_to_pte(model_path: Path, output_dir: Path, lang: str, quantize: bool = True):
    """Export a trained model to ExecuTorch .pte format.

    Orchestrates the full pipeline: optional Stage A + Stage B quantization,
    torch.export, XNNPACK lowering, .pte serialization, and tokenizer copy.
    Falls back to ONNX if ExecuTorch is not installed and quantize=False.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading model from {model_path}")
    model = AutoModelForTokenClassification.from_pretrained(model_path)
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    model.eval()

    wrapper = TitleExtractorWrapper(model)
    wrapper.eval()

    if quantize:
        # Stage B: INT8 weight-only quantization on linear layers
        print("Stage B: Quantizing linear weights to INT8...")
        quantize_linears(wrapper)
        print("  Linear weights quantized")

        # Stage A: INT8 weight-only quantization on embedding tables
        print("Stage A: Quantizing embedding weights to INT8...")
        quantize_embeddings(wrapper)
        print("  Embedding weights quantized")

    # Create example inputs (static shape for XNNPACK)
    # Use int32 to match the Int32Array sent from the app
    example_input_ids = torch.ones(1, MAX_SEQ_LEN, dtype=torch.int)
    example_attention_mask = torch.ones(1, MAX_SEQ_LEN, dtype=torch.int)

    # Step 1: torch.export
    print("Step 1: torch.export...")
    exported = torch.export.export(
        wrapper,
        (example_input_ids, example_attention_mask),
    )
    if quantize:
        # Model is fully captured in the graph; release to reduce peak memory.
        # Keep wrapper alive for non-quantize path (needed by ONNX fallback).
        del model, wrapper
    print(f"  Exported graph: {len(list(exported.graph.nodes))} nodes")

    # Step 2: Edge IR + XNNPACK lowering
    print("Step 2: Edge transform and XNNPACK lowering...")
    try:
        from executorch.exir import to_edge_transform_and_lower
        from executorch.backends.xnnpack.partition.xnnpack_partitioner import XnnpackPartitioner

        et_program = to_edge_transform_and_lower(
            exported,
            partitioner=[XnnpackPartitioner()],
        ).to_executorch()

        # Step 3: Save .pte
        print("Step 3: Saving .pte...")
        pte_path = output_dir / "title_extractor_xnnpack.pte"
        with open(pte_path, "wb") as f:
            f.write(et_program.buffer)

        size_mb = pte_path.stat().st_size / 1024 / 1024
        print(f"  Saved: {pte_path} ({size_mb:.1f} MB)")

        # Size gate
        limit = MAX_SIZE_MB.get(lang, 150)
        if size_mb > limit:
            print(f"  WARNING: Model is {size_mb:.1f} MB, exceeds {limit} MB target")
        else:
            print(f"  OK: Model is within {limit} MB target")

    except ImportError as e:
        if quantize:
            raise RuntimeError(
                "ExecuTorch is required for quantized export. "
                "Install it or use --no-quantize for ONNX fallback."
            ) from e
        print(f"\n  ExecuTorch not installed: {e}")
        print("  Falling back to ONNX export...")
        export_to_onnx(wrapper, example_input_ids, example_attention_mask, output_dir)

    # Copy tokenizer files
    print("Copying tokenizer...")
    tokenizer_files = list(model_path.glob("sentencepiece*")) + list(model_path.glob("tokenizer*"))
    for f in tokenizer_files:
        if f.is_file():
            dest = output_dir / f.name
            shutil.copy2(f, dest)
            print(f"  {f.name}")

    # Also save full tokenizer for JS fallback
    tokenizer.save_pretrained(output_dir / "tokenizer")

    print(f"\nExport complete. Files in {output_dir}")


def export_to_onnx(wrapper, example_input_ids, example_attention_mask, output_dir):
    """Fallback ONNX export if ExecuTorch is not available."""
    onnx_path = output_dir / "title_extractor.onnx"
    print(f"  Exporting to ONNX: {onnx_path}")

    torch.onnx.export(
        wrapper,
        (example_input_ids, example_attention_mask),
        str(onnx_path),
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "attention_mask": {0: "batch", 1: "seq"},
            "logits": {0: "batch", 1: "seq"},
        },
        opset_version=17,
    )
    print(f"  Saved: {onnx_path} ({onnx_path.stat().st_size / 1024 / 1024:.1f} MB)")
    print("\n  To convert ONNX → .pte, install executorch and re-run:")
    print("    pip install executorch torchao")
    print(f"    python3 tools/title-loop/export_to_executorch.py --lang <LANG>")


def main():
    parser = argparse.ArgumentParser(
        description="Export title extraction model to ExecuTorch .pte with INT8 quantization"
    )
    parser.add_argument("--lang", required=True, choices=["pl", "en"])
    parser.add_argument(
        "--model-path", type=str, default=None,
        help="Path to model checkpoint. Defaults to models/{lang}/best/",
    )
    parser.add_argument(
        "--no-quantize", action="store_true",
        help="Skip INT8 quantization (for baseline comparison)",
    )
    args = parser.parse_args()

    model_path = Path(args.model_path) if args.model_path else MODELS_DIR / args.lang / "best"
    export_dir = MODELS_DIR / "export" / args.lang
    export_to_pte(model_path, export_dir, args.lang, quantize=not args.no_quantize)


if __name__ == "__main__":
    main()

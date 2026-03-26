#!/usr/bin/env python3
"""
Export a per-language model to ExecuTorch .pte format with XNNPACK backend.

Usage:
    python3 tools/title-loop/export_to_executorch.py --lang pl
    python3 tools/title-loop/export_to_executorch.py --lang en

Pipeline: PyTorch → torch.export → ExecuTorch edge IR → XNNPACK → .pte

Reads:  tools/title-loop/models/{lang}/best/
Writes: tools/title-loop/models/export/{lang}/title_extractor_xnnpack.pte
"""

import argparse
import shutil
from pathlib import Path

import torch
from transformers import AutoModelForTokenClassification, AutoTokenizer

MODELS_DIR = Path(__file__).parent / "models"
MAX_SEQ_LEN = 512


class TitleExtractorWrapper(torch.nn.Module):
    """Wrapper that takes input_ids and attention_mask, returns logits."""

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
        outputs = self.model(input_ids=input_ids, attention_mask=attention_mask)
        return outputs.logits


def export_to_pte(model_path: Path, output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading model from {model_path}")
    model = AutoModelForTokenClassification.from_pretrained(model_path)
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    model.eval()

    wrapper = TitleExtractorWrapper(model)
    wrapper.eval()

    # Create example inputs (static shape for XNNPACK)
    example_input_ids = torch.ones(1, MAX_SEQ_LEN, dtype=torch.long)
    example_attention_mask = torch.ones(1, MAX_SEQ_LEN, dtype=torch.long)

    # Step 1: torch.export
    print("Step 1: torch.export...")
    exported = torch.export.export(
        wrapper,
        (example_input_ids, example_attention_mask),
    )
    print(f"  Exported graph: {len(list(exported.graph.nodes))} nodes")

    # Step 2: Convert to edge IR
    print("Step 2: Converting to edge IR...")
    try:
        from executorch.exir import to_edge

        edge = to_edge(exported)
        print("  Edge IR created")

        # Step 3: XNNPACK delegation
        print("Step 3: Delegating to XNNPACK...")
        try:
            from executorch.backends.xnnpack.partition import XnnpackPartitioner

            edge = edge.to_backend(XnnpackPartitioner())
            print("  XNNPACK delegation complete")
        except ImportError:
            print("  WARNING: XNNPACK partitioner not available, skipping delegation")

        # Step 4: Save .pte
        print("Step 4: Saving .pte...")
        pte_path = output_dir / "title_extractor_xnnpack.pte"
        with open(pte_path, "wb") as f:
            f.write(edge.to_executorch().buffer)
        print(f"  Saved: {pte_path} ({pte_path.stat().st_size / 1024 / 1024:.1f} MB)")

    except ImportError as e:
        print(f"\n  ExecuTorch not installed: {e}")
        print("  Falling back to ONNX export...")
        export_to_onnx(wrapper, example_input_ids, example_attention_mask, output_dir)

    # Copy tokenizer files
    print("Copying tokenizer...")
    tokenizer_files = list(model_path.glob("sentencepiece*")) + list(model_path.glob("tokenizer*"))
    for f in tokenizer_files:
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
    print("\n  To convert ONNX → .pte, install executorch and run:")
    print("    pip install executorch")
    print("    python3 tools/title-loop/export_to_executorch.py")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lang", required=True, choices=["pl", "en"])
    parser.add_argument("--model-path", type=str, default=None)
    args = parser.parse_args()

    model_path = Path(args.model_path) if args.model_path else MODELS_DIR / args.lang / "best"
    export_dir = MODELS_DIR / "export" / args.lang
    export_to_pte(model_path, export_dir)


if __name__ == "__main__":
    main()

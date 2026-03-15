/**
 * Shared MiniLM embedder infrastructure.
 * Used by both the main CLI and the title-loop extraction script.
 */

import { pipeline } from "@huggingface/transformers";

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

export interface EmbeddingOutput {
  data: Float32Array | Array<number>;
}

export interface FeatureEmbedder {
  (
    text: string,
    options: { pooling: "mean"; normalize: true }
  ): Promise<EmbeddingOutput>;
}

export async function loadEmbedder(
  onProgress?: (progress: {
    status?: string;
    loaded?: number;
    total?: number;
  }) => void
): Promise<FeatureEmbedder> {
  return (await pipeline("feature-extraction", MODEL_NAME, {
    ...(onProgress ? { progress_callback: onProgress } : {}),
  })) as unknown as FeatureEmbedder;
}

export async function embedText(
  embedder: FeatureEmbedder,
  text: string
): Promise<Array<number>> {
  const output = await embedder(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

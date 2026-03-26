/**
 * On-device title extraction using per-language fine-tuned token classification models.
 *
 * Uses ExecutorchModule (raw tensor I/O) and TokenizerModule (SentencePiece/WordPiece)
 * from react-native-executorch to run BIO predictions on OCR text.
 *
 * Models are lazy-loaded per language on first request with stale-while-revalidate:
 * the cached model is used immediately while a background check fetches updates.
 */

import {
  ExecutorchModule,
  TokenizerModule,
  ScalarType,
} from "react-native-executorch";
import type { TensorPtr } from "react-native-executorch";
import AsyncStorage from "@react-native-async-storage/async-storage";

type AppLanguage = "en" | "pl";

const MAX_SEQ_LEN = 512;
const B_TITLE = 1;
const I_TITLE = 2;
const ETAG_STORAGE_PREFIX = "title-extractor-etag:";

// Per-language model URLs — update after uploading to HuggingFace
const MODEL_URLS: Record<
  AppLanguage,
  { model: string; tokenizer: string; name: string }
> = {
  pl: {
    name: "bert-base-polish-cased-v1",
    model:
      "https://huggingface.co/erykpiast/fasola-title-extractor-pl/resolve/main/title_extractor.onnx",
    tokenizer:
      "https://huggingface.co/erykpiast/fasola-title-extractor-pl/resolve/main/tokenizer.json",
  },
  en: {
    name: "TinyBERT_General_4L_312D",
    model:
      "https://huggingface.co/erykpiast/fasola-title-extractor-en/resolve/main/title_extractor.onnx",
    tokenizer:
      "https://huggingface.co/erykpiast/fasola-title-extractor-en/resolve/main/tokenizer.json",
  },
};

interface LangModel {
  executorch: ExecutorchModule;
  tokenizer: TokenizerModule;
}

class TitleExtractorModelManager {
  private models: Partial<Record<AppLanguage, LangModel>> = {};
  private loading: Partial<Record<AppLanguage, Promise<void>>> = {};

  isLoaded(lang: AppLanguage): boolean {
    return lang in this.models;
  }

  async initialize(lang: AppLanguage): Promise<void> {
    if (this.models[lang]) return;

    if (this.loading[lang]) {
      await this.loading[lang];
      return;
    }

    const loadPromise = this._load(lang);
    this.loading[lang] = loadPromise;
    try {
      await loadPromise;
    } finally {
      delete this.loading[lang];
    }

    // Check for updates in the background (stale-while-revalidate)
    this._checkForUpdate(lang).catch(() => {
      // Silently ignore — the current model works fine
    });
  }

  private async _load(lang: AppLanguage): Promise<void> {
    const urls = MODEL_URLS[lang];
    console.log(`[TitleExtractorModel] Loading ${lang} model...`);

    try {
      const execModule = new ExecutorchModule();
      await execModule.load(urls.model);

      const tokModule = new TokenizerModule();
      await tokModule.load({ tokenizerSource: urls.tokenizer });

      this.models[lang] = { executorch: execModule, tokenizer: tokModule };
      console.log(`[TitleExtractorModel] ${lang} model loaded (${urls.name})`);
    } catch (error) {
      console.warn(
        `[TitleExtractorModel] Failed to load ${lang} model:`,
        error
      );
    }
  }

  /**
   * Stale-while-revalidate: check if the remote model has a newer ETag.
   * If so, clear the local cache so the next app launch downloads the new version.
   */
  private async _checkForUpdate(lang: AppLanguage): Promise<void> {
    const url = MODEL_URLS[lang].model;
    const storageKey = `${ETAG_STORAGE_PREFIX}${lang}`;

    try {
      const response = await fetch(url, { method: "HEAD" });
      if (!response.ok) return;

      const remoteEtag =
        response.headers.get("etag") ||
        response.headers.get("last-modified") ||
        null;
      if (!remoteEtag) return;

      const storedEtag = await AsyncStorage.getItem(storageKey);

      if (storedEtag === null) {
        // First time — just store the current ETag
        await AsyncStorage.setItem(storageKey, remoteEtag);
        return;
      }

      if (storedEtag !== remoteEtag) {
        console.log(
          `[TitleExtractorModel] ${lang} model update available, will download on next launch`
        );
        await AsyncStorage.setItem(storageKey, remoteEtag);

        // Delete the cached model file so ResourceFetcher re-downloads it
        const { deleteAsync } = await import("expo-file-system/legacy");
        const { documentDirectory } = await import("expo-file-system/legacy");
        const filename = url.split("/").pop();
        const cachedPath = `${documentDirectory}react-native-executorch/${filename}`;
        await deleteAsync(cachedPath, { idempotent: true });

        console.log(
          `[TitleExtractorModel] ${lang} cache cleared — new model will load on next launch`
        );
      }
    } catch {
      // Network error, offline, etc. — ignore silently
    }
  }

  async extractTitle(
    ocrText: string,
    lang: AppLanguage
  ): Promise<string | undefined> {
    const model = this.models[lang];
    if (!model) return undefined;

    try {
      const tokenIds = await model.tokenizer.encode(ocrText);

      const paddedIds = new Int32Array(MAX_SEQ_LEN);
      const attentionMask = new Int32Array(MAX_SEQ_LEN);
      const seqLen = Math.min(tokenIds.length, MAX_SEQ_LEN);
      for (let i = 0; i < seqLen; i++) {
        paddedIds[i] = tokenIds[i];
        attentionMask[i] = 1;
      }

      const inputIdsTensor: TensorPtr = {
        dataPtr: paddedIds,
        sizes: [1, MAX_SEQ_LEN],
        scalarType: ScalarType.INT,
      };
      const attentionMaskTensor: TensorPtr = {
        dataPtr: attentionMask,
        sizes: [1, MAX_SEQ_LEN],
        scalarType: ScalarType.INT,
      };

      const outputTensors = await model.executorch.forward([
        inputIdsTensor,
        attentionMaskTensor,
      ]);

      const logits = new Float32Array(
        outputTensors[0].dataPtr as ArrayBuffer
      );
      const numClasses = 3;

      const titleTokenIds: number[] = [];
      let inTitle = false;

      for (let i = 0; i < seqLen; i++) {
        const offset = i * numClasses;
        const o = logits[offset];
        const b = logits[offset + 1];
        const it = logits[offset + 2];

        let predLabel: number;
        if (b >= o && b >= it) {
          predLabel = B_TITLE;
        } else if (it >= o && it >= b) {
          predLabel = I_TITLE;
        } else {
          predLabel = 0;
        }

        if (predLabel === B_TITLE) {
          inTitle = true;
          titleTokenIds.push(paddedIds[i]);
        } else if (predLabel === I_TITLE && inTitle) {
          titleTokenIds.push(paddedIds[i]);
        } else if (inTitle) {
          break;
        }
      }

      if (titleTokenIds.length === 0) return undefined;

      const title = await model.tokenizer.decode(titleTokenIds, true);
      return title?.trim() || undefined;
    } catch (error) {
      console.warn(`[TitleExtractorModel] ${lang} inference failed:`, error);
      return undefined;
    }
  }
}

export const TitleExtractorModel = new TitleExtractorModelManager();
